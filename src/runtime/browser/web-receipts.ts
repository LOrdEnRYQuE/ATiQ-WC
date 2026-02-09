import { ReceiptContract, Receipt, Action, ReceiptFilter } from '../contracts';
import { ATiQError } from '../types';

/**
 * Browser-based receipt implementation using IndexedDB
 */
export class WebReceipts implements ReceiptContract {
  private dbName = 'atiq-webcontainer-receipts';
  private storeName = 'receipts';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('success', 'success', { unique: false });
        }
      };
    });
  }

  async record(action: Action): Promise<Receipt> {
    if (!this.db) {
      throw new ATiQError('Database not initialized', 'ENOTINIT');
    }

    const receipt: Receipt = {
      id: this.generateId(),
      action,
      result: null, // Will be set when action completes
      timestamp: Date.now(),
      duration: 0, // Will be calculated when action completes
      success: false, // Will be set when action completes
      metadata: {
        userAgent: navigator.userAgent,
        origin: self.location.origin
      }
    };

    // Store the receipt immediately to track the action
    await this.saveReceipt(receipt);
    return receipt;
  }

  async get(id: string): Promise<Receipt | null> {
    if (!this.db) {
      throw new ATiQError('Database not initialized', 'ENOTINIT');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async list(filter: ReceiptFilter = {}): Promise<Receipt[]> {
    if (!this.db) {
      throw new ATiQError('Database not initialized', 'ENOTINIT');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      let request: IDBRequest;

      if (filter.type) {
        const index = store.index('type');
        request = index.getAll(filter.type);
      } else if (filter.success !== undefined) {
        const index = store.index('success');
        request = index.getAll(IDBKeyRange.only(filter.success));
      } else {
        request = store.getAll();
      }
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        let receipts = request.result;
        
        // Apply time-based filtering
        if (filter.since || filter.until) {
          receipts = receipts.filter((receipt: Receipt) => {
            if (filter.since && receipt.timestamp < filter.since) return false;
            if (filter.until && receipt.timestamp > filter.until) return false;
            return true;
          });
        }
        
        // Sort by timestamp (newest first)
        receipts.sort((a: Receipt, b: Receipt) => b.timestamp - a.timestamp);
        
        resolve(receipts);
      };
    });
  }

  async verify(receipt: Receipt): Promise<boolean> {
    if (!this.db) {
      throw new ATiQError('Database not initialized', 'ENOTINIT');
    }

    // Get the stored receipt
    const stored = await this.get(receipt.id);
    if (!stored) {
      return false;
    }

    // Verify critical fields match
    return (
      stored.action.id === receipt.action.id &&
      stored.action.type === receipt.action.type &&
      stored.action.command === receipt.action.command &&
      stored.timestamp === receipt.timestamp
    );
  }

  async updateReceipt(id: string, updates: Partial<Receipt>): Promise<void> {
    if (!this.db) {
      throw new ATiQError('Database not initialized', 'ENOTINIT');
    }

    const existing = await this.get(id);
    if (!existing) {
      throw new ATiQError(`Receipt not found: ${id}`, 'ENOTFOUND');
    }

    const updated = { ...existing, ...updates };
    await this.saveReceipt(updated);
  }

  private async saveReceipt(receipt: Receipt): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(receipt);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private generateId(): string {
    return `receipt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Utility method to create an action and record it in one step
  async createActionAndRecord(
    type: Action['type'],
    command: string,
    args?: any[],
    input?: any
  ): Promise<Receipt> {
    const action: Action = {
      id: this.generateId(),
      type,
      command,
      args,
      timestamp: Date.now(),
      input
    };

    return await this.record(action);
  }
}
