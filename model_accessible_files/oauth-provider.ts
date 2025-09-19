import {
  OAuthClientProvider,
  OAuthClientMetadata,
  OAuthClientInformation,
  OAuthTokens,
  OAuthClientInformationFull,
} from '@modelcontextprotocol/sdk/client/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { URL } from 'url';

export class FileBasedOAuthProvider implements OAuthClientProvider {
  private storageDir: string;
  private serverName: string;
  private _redirectUrl: string;
  private callbackServer?: http.Server;
  private authorizationCodePromise?: Promise<string>;

  constructor(serverName: string, redirectUrl: string = 'http://localhost:3000/oauth/callback') {
    this.serverName = serverName;
    this._redirectUrl = redirectUrl;
    this.storageDir = path.join('/model_accessible_files', '.oauth', serverName);
  }

  private startCallbackServer(): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(this._redirectUrl);
      const port = parseInt(url.port || '3000');

      this.callbackServer = http.createServer((req, res) => {
        const reqUrl = new URL(req.url!, `http://${req.headers.host}`);

        if (reqUrl.pathname === url.pathname) {
          const code = reqUrl.searchParams.get('code');
          const error = reqUrl.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`<html><body><h1>Authorization Failed</h1><p>Error: ${error}</p><p>You can close this window.</p></body></html>`);
            reject(new Error(`OAuth error: ${error}`));
          } else if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><body><h1>Authorization Successful!</h1><p>You can close this window and return to the terminal.</p></body></html>');
            resolve(code);
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<html><body><h1>Invalid Request</h1><p>No authorization code received.</p></body></html>');
            reject(new Error('No authorization code received'));
          }

          setTimeout(() => {
            this.callbackServer?.close();
            this.callbackServer = undefined;
          }, 1000);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      this.callbackServer.listen(port, () => {
        console.error(`OAuth callback server listening on port ${port}`);
      });

      this.callbackServer.on('error', (err) => {
        reject(err);
      });
    });
  }

  private async ensureStorageDir(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
  }

  private async readFile(filename: string): Promise<string | undefined> {
    try {
      const filePath = path.join(this.storageDir, filename);
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }

  private async writeFile(filename: string, content: string): Promise<void> {
    await this.ensureStorageDir();
    const filePath = path.join(this.storageDir, filename);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  get redirectUrl(): string {
    return this._redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this._redirectUrl],
      client_name: `programmatic-mcp-prototype-${this.serverName}`,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    const data = await this.readFile('client_info.json');
    if (!data) return undefined;
    return JSON.parse(data);
  }

  async saveClientInformation(clientInformation: OAuthClientInformationFull): Promise<void> {
    await this.writeFile('client_info.json', JSON.stringify(clientInformation, null, 2));
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const data = await this.readFile('tokens.json');
    if (!data) return undefined;
    return JSON.parse(data);
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.writeFile('tokens.json', JSON.stringify(tokens, null, 2));
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    console.error('\n=================================================');
    console.error('OAuth Authorization Required');
    console.error('=================================================');
    console.error(`\nStarting OAuth callback server...`);

    // Start the callback server and save the promise so we can await it later
    if (!this.authorizationCodePromise) {
      this.authorizationCodePromise = this.startCallbackServer();
    }

    console.error(`\nPlease open this URL in your browser:\n\n${authorizationUrl.toString()}\n`);
    console.error('Waiting for authorization...\n');
  }

  async getAuthorizationCode(): Promise<string> {
    if (!this.authorizationCodePromise) {
      throw new Error('No authorization in progress');
    }

    try {
      // Add timeout to prevent hanging forever
      const code = await Promise.race([
        this.authorizationCodePromise,
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('OAuth authorization timeout')), 10000)
        )
      ]);
      console.error('✓ Authorization code received!');
      this.authorizationCodePromise = undefined;
      return code;
    } catch (error) {
      console.error('✗ Authorization failed:', error);
      this.authorizationCodePromise = undefined;
      throw error;
    }
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.writeFile('code_verifier.txt', codeVerifier);
  }

  async codeVerifier(): Promise<string> {
    const verifier = await this.readFile('code_verifier.txt');
    if (!verifier) {
      throw new Error('No code verifier found');
    }
    return verifier;
  }

  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier'): Promise<void> {
    if (scope === 'all') {
      try {
        await fs.rm(this.storageDir, { recursive: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    } else if (scope === 'client') {
      await this.deleteFile('client_info.json');
    } else if (scope === 'tokens') {
      await this.deleteFile('tokens.json');
    } else if (scope === 'verifier') {
      await this.deleteFile('code_verifier.txt');
    }
  }

  private async deleteFile(filename: string): Promise<void> {
    try {
      const filePath = path.join(this.storageDir, filename);
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}