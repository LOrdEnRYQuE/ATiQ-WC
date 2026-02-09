import { NetworkContract, ServerRequest, ServerResponse, FileChangeEvent } from '../runtime/contracts';
import { FileSystemContract } from '../runtime/contracts';
import { DevServerConfig, HotReloadEvent } from '../runtime/types';

/**
 * Preview server implementation using Service Workers
 * Provides Vite-like dev server functionality
 */
export class PreviewServer {
  private server: any = null;
  private fileWatchers: Map<string, () => void> = new Map();
  private hotReloadClients: Set<MessagePort> = new Set();

  constructor(
    private fs: FileSystemContract,
    private net: NetworkContract
  ) {}

  async start(config: DevServerConfig): Promise<void> {
    const port = config.port || 5173;
    const root = config.root || '/';

    // Start the underlying server
    this.server = await this.net.listen(port, async (req) => {
      return this.handleRequest(req, config);
    });

    // Set up file watching for hot reload
    await this.setupFileWatching(root);

    console.log(`Preview server running on port ${port}`);
  }

  async stop(): Promise<void> {
    if (this.server) {
      await this.server.close();
      this.server = null;
    }

    // Clean up file watchers
    for (const unwatch of this.fileWatchers.values()) {
      unwatch();
    }
    this.fileWatchers.clear();
  }

  private async handleRequest(req: ServerRequest, config: DevServerConfig): Promise<ServerResponse> {
    const url = new URL(req.url, `http://localhost:${config.port}`);
    let pathname = url.pathname;

    // Remove leading slash for internal path resolution
    if (pathname.startsWith('/')) {
      pathname = pathname.slice(1);
    }

    // Default to index file
    if (pathname === '') {
      pathname = config.index || 'index.html';
    }

    try {
      // Try to serve the file
      const filePath = this.resolvePath(config.root, pathname);
      const content = await this.fs.readFile(filePath);

      // Determine content type
      const contentType = this.getContentType(filePath);

      // Inject HMR script for HTML files
      if (filePath.endsWith('.html')) {
        const html = new TextDecoder().decode(content);
        const hmrHtml = this.injectHMRScript(html, config.port || 5173);
        return {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*'
          },
          body: new TextEncoder().encode(hmrHtml)
        };
      }

      return {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache'
        },
        body: content
      };

    } catch (error) {
      // Try fallback file
      if (config.fallback) {
        try {
          const fallbackPath = this.resolvePath(config.root, config.fallback);
          const content = await this.fs.readFile(fallbackPath);
          
          return {
            status: 200,
            headers: {
              'Content-Type': 'text/html',
              'Access-Control-Allow-Origin': '*'
            },
            body: content
          };
        } catch (fallbackError) {
          // Fallback also failed
        }
      }

      // Return 404
      return {
        status: 404,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        },
        body: new TextEncoder().encode(`File not found: ${pathname}`)
      };
    }
  }

  private resolvePath(root: string, pathname: string): string {
    if (root === '/') {
      return '/' + pathname;
    }
    return root.endsWith('/') ? root + pathname : root + '/' + pathname;
  }

  private getContentType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    
    const types: Record<string, string> = {
      'html': 'text/html',
      'js': 'application/javascript',
      'mjs': 'application/javascript',
      'ts': 'text/typescript',
      'css': 'text/css',
      'json': 'application/json',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'ico': 'image/x-icon',
      'woff': 'font/woff',
      'woff2': 'font/woff2',
      'ttf': 'font/ttf'
    };

    return types[ext || ''] || 'text/plain';
  }

  private injectHMRScript(html: string, port: number): string {
    const hmrScript = `
      <script>
        // ATiQ Hot Module Replacement
        (function() {
          let ws;
          const serverPort = ${port};
          
          function connect() {
            ws = new WebSocket('ws://localhost:' + serverPort + '/__hmr');
            
            ws.onmessage = function(event) {
              const data = JSON.parse(event.data);
              
              if (data.type === 'reload') {
                console.log('🔄 Reloading due to file changes...');
                window.location.reload();
              } else if (data.type === 'update') {
                console.log('🔥 Hot update:', data.path);
                // Handle hot module replacement
                if (window.__atiq_hmr__) {
                  window.__atiq_hmr__(data);
                }
              }
            };
            
            ws.onclose = function() {
              setTimeout(connect, 1000);
            };
            
            ws.onerror = function() {
              setTimeout(connect, 1000);
            };
          }
          
          connect();
        })();
      </script>
    `;

    // Insert before closing body tag
    const bodyCloseIndex = html.lastIndexOf('</body>');
    if (bodyCloseIndex !== -1) {
      return html.slice(0, bodyCloseIndex) + hmrScript + html.slice(bodyCloseIndex);
    }

    // If no body tag, append at end
    return html + hmrScript;
  }

  private async setupFileWatching(root: string): Promise<void> {
    // Watch for file changes in the root directory
    try {
      if (this.fs.watch) {
        const watchFunction = await this.fs.watch(root, (event) => {
          this.handleFileChange(event);
        });
        
        this.fileWatchers.set(root, watchFunction);
      }
    } catch (error) {
      console.warn('File watching not supported:', error);
    }
  }

  private handleFileChange(event: FileChangeEvent): void {
    // Convert FileChangeEvent to HotReloadEvent
    const hotReloadEvent: HotReloadEvent = {
      type: event.type === 'change' ? 'update' : event.type === 'delete' ? 'delete' : 'add',
      path: event.path,
      timestamp: Date.now()
    };
    // Notify all connected clients
    const message = JSON.stringify({
      type: event.type === 'delete' ? 'reload' : 'update',
      path: event.path,
      timestamp: hotReloadEvent.timestamp
    });

    this.hotReloadClients.forEach(client => {
      try {
        client.postMessage(message);
      } catch (error) {
        // Remove disconnected clients
        this.hotReloadClients.delete(client);
      }
    });
  }

  /**
   * Register a hot reload client
   */
  registerHMRClient(port: MessagePort): void {
    this.hotReloadClients.add(port);
    
    port.onmessage = (event) => {
      if (event.data.type === 'unregister') {
        this.hotReloadClients.delete(port);
      }
    };
  }

  /**
   * Get server status
   */
  getStatus(): {
    running: boolean;
    port?: number;
    clients: number;
    watchedFiles: number;
  } {
    return {
      running: this.server !== null,
      port: this.server?.port,
      clients: this.hotReloadClients.size,
      watchedFiles: this.fileWatchers.size
    };
  }
}
