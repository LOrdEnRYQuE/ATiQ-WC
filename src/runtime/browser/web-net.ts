import { NetworkContract, ServerRequest, ServerResponse, Server } from '../contracts';
import { NetworkError } from '../types';

/**
 * Browser-based networking implementation
 * Uses fetch API and Service Workers for local servers
 */
export class WebNet implements NetworkContract {
  private servers: Map<number, Server> = new Map();
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;

  async fetch(url: string, options?: RequestInit): Promise<Response> {
    try {
      // Apply security restrictions
      if (!this.isUrlAllowed(url)) {
        throw new NetworkError(`URL not allowed: ${url}`, 'EACCES', url);
      }

      const response = await fetch(url, options);
      return response;
    } catch (error) {
      throw new NetworkError(`Fetch failed: ${error}`, 'ECONNREFUSED', url);
    }
  }

  async listen(port: number, handler: (req: ServerRequest) => Promise<ServerResponse>): Promise<Server> {
    if (this.servers.has(port)) {
      throw new NetworkError(`Port already in use: ${port}`, 'EADDRINUSE');
    }

    // Check if Service Workers are available
    if (!('serviceWorker' in navigator)) {
      throw new NetworkError('Service Workers not supported', 'ENOTSUP');
    }

    try {
      // Register a Service Worker for this port
      const registration = await this.registerServiceWorker(port);
      
      const server: Server = {
        port,
        close: async () => {
          await registration.unregister();
          this.servers.delete(port);
        }
      };

      this.servers.set(port, server);
      
      // Set up message handling for this server
      this.setupServerHandler(port, handler, registration);
      
      return server;
    } catch (error) {
      throw new NetworkError(`Failed to start server: ${error}`, 'EADDRNOTAVAIL', String(port));
    }
  }

  async isPortAvailable(port: number): Promise<boolean> {
    try {
      await this.listen(port, async () => ({ 
        status: 200, 
        headers: {}, 
        body: new Uint8Array(0) 
      }));
      return true;
    } catch (error) {
      if (error instanceof NetworkError && error.code === 'EADDRINUSE') {
        return false;
      }
      throw error;
    }
  }

  private isUrlAllowed(url: string): boolean {
    try {
      const parsed = new URL(url);
      
      // Allow same-origin and common CDNs
      const allowedOrigins = [
        self.location.origin,
        'https://cdn.jsdelivr.net',
        'https://unpkg.com',
        'https://npmjs.com',
        'https://registry.npmjs.org'
      ];
      
      return allowedOrigins.some(origin => parsed.origin === origin);
    } catch {
      return false;
    }
  }

  private async registerServiceWorker(port: number): Promise<ServiceWorkerRegistration> {
    const workerCode = this.generateServiceWorkerCode(port);
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    
    const registration = await navigator.serviceWorker.register(workerUrl, {
      scope: `/atiq-server-${port}/`
    });
    
    // Wait for the worker to be ready
    await this.waitForWorkerReady(registration);
    
    return registration;
  }

  private async waitForWorkerReady(registration: ServiceWorkerRegistration): Promise<void> {
    return new Promise((resolve) => {
      if (registration.active) {
        resolve();
        return;
      }
      
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (worker) {
          worker.addEventListener('statechange', () => {
            if (worker.state === 'activated') {
              resolve();
            }
          });
        }
      });
    });
  }

  private setupServerHandler(
    port: number, 
    handler: (req: ServerRequest) => Promise<ServerResponse>,
    registration: ServiceWorkerRegistration
  ): void {
    // Store the handler for this port
    this.portHandlers.set(port, handler);
    
    // Listen for messages from the Service Worker
    navigator.serviceWorker.addEventListener('message', async (event) => {
      if (event.data.type === 'atiq-server-request' && event.data.port === port) {
        const request = event.data.request;
        
        try {
          const response = await handler(request);
          
          // Send response back to Service Worker
          event.ports[0].postMessage({
            type: 'atiq-server-response',
            response
          });
        } catch (error) {
          event.ports[0].postMessage({
            type: 'atiq-server-error',
            error: String(error)
          });
        }
      }
    });
  }

  private portHandlers: Map<number, (req: ServerRequest) => Promise<ServerResponse>> = new Map();

  private generateServiceWorkerCode(port: number): string {
    return `
      // ATiQ WebContainer Service Worker for port ${port}
      const SCOPE = '/atiq-server-${port}/';

      self.addEventListener('install', (event) => {
        event.waitUntil(self.skipWaiting());
      });

      self.addEventListener('activate', (event) => {
        event.waitUntil(self.clients.claim());
      });

      self.addEventListener('fetch', (event) => {
        const url = new URL(event.request.url);
        
        // Only handle requests for our scope
        if (!url.pathname.startsWith(SCOPE)) {
          return;
        }

        // Convert fetch request to our format
        const request = {
          method: event.request.method,
          url: url.pathname + url.search,
          headers: Object.fromEntries(event.request.headers.entries()),
          body: event.request.body
        };

        // Forward request to main thread
        const messageChannel = new MessageChannel();
        
        messageChannel.port1.onmessage = (event) => {
          if (event.data.type === 'atiq-server-response') {
            const response = event.data.response;
            
            // Create Response object
            const responseData = new Response(response.body, {
              status: response.status,
              headers: response.headers
            });
            
            event.respondWith(responseData);
          } else if (event.data.type === 'atiq-server-error') {
            event.respondWith(
              new Response(event.data.error, { status: 500 })
            );
          }
        };

        self.postMessage({
          type: 'atiq-server-request',
          port: ${port},
          request
        }, [messageChannel.port2]);
      });
    `;
  }
}
