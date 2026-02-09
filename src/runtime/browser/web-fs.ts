import { FileSystemContract, FileStats, FileChangeEvent } from '../contracts';
import { VirtualFile, FileSystemError } from '../types';

/**
 * Browser-based WebFS implementation
 * Uses in-memory structure with IndexedDB persistence
 */
export class WebFS implements FileSystemContract {
  private root: VirtualFile;
  private watchers: Map<string, Set<(event: FileChangeEvent) => void>> = new Map();
  private dbName = 'atiq-webcontainer-fs';
  private storeName = 'filesystem';
  private db: IDBDatabase | null = null;

  constructor() {
    this.root = this.createDirectory('/', 0);
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.loadFromDB().then(resolve).catch(reject);
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  private createDirectory(path: string, timestamp: number): VirtualFile {
    return {
      path,
      content: new Uint8Array(0),
      stats: {
        isFile: false,
        isDirectory: true,
        size: 0,
        mtime: timestamp,
        ctime: timestamp,
        mode: 0o755
      },
      children: new Map()
    };
  }

  private createFile(path: string, content: Uint8Array, timestamp: number): VirtualFile {
    return {
      path,
      content,
      stats: {
        isFile: true,
        isDirectory: false,
        size: content.length,
        mtime: timestamp,
        ctime: timestamp,
        mode: 0o644
      }
    };
  }

  private async loadFromDB(): Promise<void> {
    if (!this.db) return;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get('root');
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (request.result) {
          this.root = request.result;
        }
        resolve();
      };
    });
  }

  private async saveToDB(): Promise<void> {
    if (!this.db) return;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(this.root, 'root');
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private findNode(path: string): VirtualFile | null {
    if (path === '/') return this.root;
    
    const parts = path.split('/').filter(Boolean);
    let current = this.root;
    
    for (const part of parts) {
      if (!current.children || !current.children.has(part)) {
        return null;
      }
      current = current.children.get(part)!;
    }
    
    return current;
  }

  private findParentNode(path: string): { parent: VirtualFile; name: string } | null {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    
    const name = parts.pop()!;
    let current = this.root;
    
    for (const part of parts) {
      if (!current.children || !current.children.has(part)) {
        return null;
      }
      current = current.children.get(part)!;
    }
    
    return { parent: current, name };
  }

  async readFile(path: string): Promise<Uint8Array> {
    const node = this.findNode(path);
    if (!node) {
      throw new FileSystemError(`File not found: ${path}`, 'ENOENT', path);
    }
    if (!node.stats.isFile) {
      throw new FileSystemError(`Path is a directory: ${path}`, 'EISDIR', path);
    }
    return node.content;
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const timestamp = Date.now();
    const parent = this.findParentNode(path);
    
    if (!parent) {
      throw new FileSystemError(`Invalid path: ${path}`, 'EINVAL', path);
    }
    
    const existing = parent.parent.children?.get(parent.name);
    if (existing && existing.stats.isDirectory) {
      throw new FileSystemError(`Path is a directory: ${path}`, 'EISDIR', path);
    }
    
    const file = this.createFile(path, data, timestamp);
    
    if (!parent.parent.children) {
      parent.parent.children = new Map();
    }
    parent.parent.children.set(parent.name, file);
    
    await this.saveToDB();
    this.notifyWatchers(path, 'change');
  }

  async exists(path: string): Promise<boolean> {
    return this.findNode(path) !== null;
  }

  async stat(path: string): Promise<FileStats> {
    const node = this.findNode(path);
    if (!node) {
      throw new FileSystemError(`File not found: ${path}`, 'ENOENT', path);
    }
    return node.stats;
  }

  async readdir(path: string): Promise<string[]> {
    const node = this.findNode(path);
    if (!node) {
      throw new FileSystemError(`Directory not found: ${path}`, 'ENOENT', path);
    }
    if (!node.stats.isDirectory) {
      throw new FileSystemError(`Path is not a directory: ${path}`, 'ENOTDIR', path);
    }
    return Array.from(node.children?.keys() || []);
  }

  async mkdir(path: string, options: { recursive?: boolean } = {}): Promise<void> {
    const timestamp = Date.now();
    const parts = path.split('/').filter(Boolean);
    let current = this.root;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const currentPath = '/' + parts.slice(0, i + 1).join('/');
      
      if (!current.children) {
        current.children = new Map();
      }
      
      let next = current.children.get(part);
      if (!next) {
        next = this.createDirectory(currentPath, timestamp);
        current.children.set(part, next);
      } else if (next.stats.isFile && i < parts.length - 1) {
        throw new FileSystemError(`Path component is a file: ${currentPath}`, 'ENOTDIR', currentPath);
      }
      
      current = next;
    }
    
    await this.saveToDB();
    this.notifyWatchers(path, 'change');
  }

  async rmdir(path: string, options: { recursive?: boolean } = {}): Promise<void> {
    const parent = this.findParentNode(path);
    if (!parent) {
      throw new FileSystemError(`Invalid path: ${path}`, 'EINVAL', path);
    }
    
    const node = parent.parent.children?.get(parent.name);
    if (!node) {
      throw new FileSystemError(`Directory not found: ${path}`, 'ENOENT', path);
    }
    if (node.stats.isFile) {
      throw new FileSystemError(`Path is not a directory: ${path}`, 'ENOTDIR', path);
    }
    if (!options.recursive && node.children && node.children.size > 0) {
      throw new FileSystemError(`Directory not empty: ${path}`, 'ENOTEMPTY', path);
    }
    
    parent.parent.children!.delete(parent.name);
    await this.saveToDB();
    this.notifyWatchers(path, 'delete');
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const oldParent = this.findParentNode(oldPath);
    const newParent = this.findParentNode(newPath);
    
    if (!oldParent || !newParent) {
      throw new FileSystemError('Invalid path', 'EINVAL');
    }
    
    const node = oldParent.parent.children?.get(oldParent.name);
    if (!node) {
      throw new FileSystemError(`Source not found: ${oldPath}`, 'ENOENT', oldPath);
    }
    
    const newName = newPath.split('/').pop()!;
    
    oldParent.parent.children!.delete(oldParent.name);
    
    if (!newParent.parent.children) {
      newParent.parent.children = new Map();
    }
    newParent.parent.children.set(newName, node);
    
    await this.saveToDB();
    this.notifyWatchers(oldPath, 'rename');
    this.notifyWatchers(newPath, 'change');
  }

  async unlink(path: string): Promise<void> {
    const parent = this.findParentNode(path);
    if (!parent) {
      throw new FileSystemError(`Invalid path: ${path}`, 'EINVAL', path);
    }
    
    const node = parent.parent.children?.get(parent.name);
    if (!node) {
      throw new FileSystemError(`File not found: ${path}`, 'ENOENT', path);
    }
    if (node.stats.isDirectory) {
      throw new FileSystemError(`Path is a directory: ${path}`, 'EISDIR', path);
    }
    
    parent.parent.children!.delete(parent.name);
    await this.saveToDB();
    this.notifyWatchers(path, 'delete');
  }

  async copyFile(src: string, dest: string): Promise<void> {
    const srcData = await this.readFile(src);
    await this.writeFile(dest, srcData);
  }

  watch(path: string, callback: (event: FileChangeEvent) => void): Promise<() => void> {
    return Promise.resolve(() => {
      if (!this.watchers.has(path)) {
        this.watchers.set(path, new Set());
      }
      
      this.watchers.get(path)!.add(callback);
      
      return () => {
        const watchers = this.watchers.get(path);
        if (watchers) {
          watchers.delete(callback);
          if (watchers.size === 0) {
            this.watchers.delete(path);
          }
        }
      };
    });
  }

  private notifyWatchers(path: string, type: FileChangeEvent['type']): void {
    const event: FileChangeEvent = { type, path };
    
    // Notify exact path watchers
    const exactWatchers = this.watchers.get(path);
    if (exactWatchers) {
      exactWatchers.forEach(callback => callback(event));
    }
    
    // Notify parent directory watchers
    const parts = path.split('/').filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      const parentPath = '/' + parts.slice(0, i).join('/');
      const parentWatchers = this.watchers.get(parentPath);
      if (parentWatchers) {
        parentWatchers.forEach(callback => callback(event));
      }
    }
  }
}
