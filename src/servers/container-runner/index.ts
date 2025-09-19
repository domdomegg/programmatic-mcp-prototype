#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn, spawnSync } from 'child_process';
import { setTimeout } from 'timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Global container reference
let globalContainerId: string | null = null;
let containerProxyClient: Client | null = null;

async function ensureDockerImage() {
  const result = await runDockerCommand(['images', '-q', 'mcp-runner:latest']);

  if (!result.stdout.trim()) {
    console.error('Building Docker image for code execution...');
    await runDockerCommand(['build', '-t', 'mcp-runner:latest', __dirname]);
  }
}

async function cleanupOrphanedContainers() {
  // Find containers using our image
  const result = await runDockerCommand(['ps', '-a', '-q', '--filter', 'ancestor=mcp-runner:latest']);
  const containerIds = result.stdout.trim().split('\n').filter(Boolean);

  if (containerIds.length > 0) {
    console.error(`[container-runner] Found ${containerIds.length} orphaned container(s), cleaning up...`);
    for (const id of containerIds) {
      await runDockerCommand(['stop', id]);
      await runDockerCommand(['rm', id]);
    }
    console.error('[container-runner] Orphaned containers cleaned up');
  }
}

async function ensureProxyServer() {
  // Create entrypoint script that starts the ToolProxy HTTP server
  const proxyServerCode = `
import { ToolProxy } from '../tool-proxy.js';

const configModule = await import('../config/servers.js');
const config = configModule.default;

// Suppress verbose logging
const originalConsoleError = console.error;
console.error = (...args) => {
  const msg = args.join(' ');
  // Only log critical messages
  if (msg.includes('✗') || msg.includes('Error') || msg.includes('failed')) {
    originalConsoleError(...args);
  }
};

const toolProxy = new ToolProxy(config);
await toolProxy.initialize();

// Restore console
console.error = originalConsoleError;

// Start HTTP server on port 8000
await toolProxy.startHttpServer(8000);
console.error('ToolProxy ready with', toolProxy.getTools().size, 'tools');
`;

  const proxyServerFile = path.join('./model_accessible_files/workspace', '_proxy_server.mts');
  await fs.writeFile(proxyServerFile, proxyServerCode);

  // Create MCP client module for calling the proxy server
  const proxyClientCode = `
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

let clientInstance: Client | null = null;

export async function getClient(): Promise<Client> {
  if (clientInstance) {
    return clientInstance;
  }

  const client = new Client(
    { name: 'container-script-client', version: '1.0.0' },
    { capabilities: {} }
  );

  const transport = new StreamableHTTPClientTransport(
    new URL('http://localhost:8000/mcp')
  );

  await client.connect(transport);
  clientInstance = client;
  return client;
}

export async function callTool(name: string, args: any) {
  const client = await getClient();
  return await client.callTool({ name, arguments: args });
}
`;

  const proxyClientFile = path.join('./model_accessible_files/workspace', 'proxy.mts');
  await fs.writeFile(proxyClientFile, proxyClientCode);
}

async function startLongRunningContainer(): Promise<string> {
  await ensureProxyServer();

  const result = await runDockerCommand([
    'run', '-d',
    '--rm',
    '-v', `${path.resolve('./model_accessible_files')}:/model_accessible_files`,
    '-v', `${path.resolve('./node_modules')}:/node_modules:ro`,
    '-w', '/model_accessible_files/workspace',
    '--memory', '512m',
    '-p', '3000:3000',  // Map OAuth callback port
    '-p', '8000:8000',  // Map MCP server port
    'mcp-runner:latest',
    'tail', '-f', '/dev/null'
  ]);

  // Check for errors
  if (result.exitCode !== 0 || result.stderr.includes('Error')) {
    throw new Error(`Failed to start container: ${result.stderr}`);
  }

  const containerId = result.stdout.trim();
  if (!containerId) {
    throw new Error(`No container ID returned. stderr: ${result.stderr}`);
  }

  // Start the proxy server in the background
  const proxyProcess = spawn('docker', [
    'exec', containerId,
    'tsx', '/model_accessible_files/workspace/_proxy_server.mts'
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  // Only show error output or ready message
  proxyProcess.stderr.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('Error') || msg.includes('failed') || msg.includes('ready with')) {
      process.stderr.write(msg);
    }
  });

  // Retry connection frequently (every 200ms for up to 30 seconds)
  const maxRetries = 150;
  const retryDelay = 200; // milliseconds

  for (let i = 0; i < maxRetries; i++) {
    try {
      const proxyClient = new Client(
        { name: 'container-runner-to-proxy', version: '1.0.0' },
        { capabilities: {} }
      );

      const transport = new StreamableHTTPClientTransport(
        new URL('http://localhost:8000/mcp')
      );

      await proxyClient.connect(transport);
      containerProxyClient = proxyClient;
      break;
    } catch (error) {
      if (i >= maxRetries - 1) {
        throw new Error(`Failed to connect to ToolProxy after ${maxRetries} attempts: ${error}`);
      }
      await setTimeout(retryDelay);
    }
  }

  return containerId;
}

async function ensureContainer(): Promise<string> {
  if (globalContainerId && containerProxyClient) {
    try {
      const result = await runDockerCommand(['inspect', '-f', '{{.State.Running}}', globalContainerId]);
      if (result.stdout.trim() === 'true') {
        return globalContainerId;
      }
    } catch {
      // Container no longer exists
    }
  }

  // Reset globals and create new container
  globalContainerId = null;
  containerProxyClient = null;
  globalContainerId = await startLongRunningContainer();
  return globalContainerId;
}

async function executeInContainer(code: string, timeout: number = 30000): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const containerId = await ensureContainer();

  // Write code to container workspace
  const codeId = randomUUID();
  const codeFile = `exec-${codeId}.mts`;
  const codeFilePath = path.join('./model_accessible_files/workspace', codeFile);

  await fs.writeFile(codeFilePath, code);

  try {
    const result = await runDockerCommand(
      ['exec', containerId, 'tsx', `/model_accessible_files/workspace/${codeFile}`],
      timeout
    );

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  } finally {
    // Clean up code file
    try {
      await fs.unlink(codeFilePath);
    } catch {}
  }
}

function runDockerCommand(args: string[], timeout: number = 30000): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', args);
    let stdout = '';
    let stderr = '';
    let fulfilled = false;

    setTimeout(timeout).then(() => {
      if (fulfilled) {
        return;
      }
      proc.kill();
      // Return what we have so far instead of rejecting
      console.error(`[container-runner] Command timed out. stdout: ${stdout.substring(0, 200)}, stderr: ${stderr.substring(0, 200)}`);
      reject(new Error(`Docker command timed out. stderr: ${stderr.substring(0, 500)}`));
    });

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      fulfilled = true;
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });

    proc.on('error', (err) => {
      fulfilled = true;
      reject(err);
    });
  });
}

async function main() {
  await cleanupOrphanedContainers();
  await ensureDockerImage();

  const server = new McpServer({
    name: 'container-runner',
    version: '1.0.0',
  });

  server.registerTool(
    'execute',
    {
      description: 'Execute TypeScript code in an isolated Docker container with access to MCP tools',
      inputSchema: {
        code: z.string().describe(`TypeScript code to execute. Write extremely succinct code, avoid comments and unnecessary error handling. All code will be automatically prefixed with \`import * as servers from '../generated/index.js';\` so you don't need to import that yourself.`),
        timeout: z.number().optional().default(30000).describe('Execution timeout in milliseconds'),
      },
      outputSchema: {
        stdout: z.string().describe('Standard output from the code execution'),
        stderr: z.string().describe('Standard error from the code execution'),
        exitCode: z.number().describe('Exit code of the execution (0 for success)'),
      },
    },
    async ({ code, timeout }) => {
      const result = await executeInContainer(`import * as servers from '../generated/index.js';\n` + code, timeout);

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    }
  );

  server.registerTool(
    'list_tools',
    {
      description: 'List all available MCP tools from the container proxy',
      outputSchema: {
        tools: z.array(z.any()).describe('Array of available MCP tools'),
      },
    },
    async () => {
      if (!containerProxyClient) {
        await ensureContainer();
      }

      if (!containerProxyClient) {
        return {
          content: [{ type: 'text', text: 'Container proxy client failed to connect' }],
          isError: true,
        };
      }

      const toolsResponse = await containerProxyClient.listTools();
      const result = { tools: toolsResponse.tools || [] };

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    }
  );

  // Cleanup on exit
  const cleanup = () => {
    if (globalContainerId) {
      console.error(`[container-runner] Cleanup for ${globalContainerId}`);
      spawnSync('docker', ['stop', globalContainerId]);
      spawnSync('docker', ['rm', globalContainerId]);
    }
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('[container-runner] Uncaught exception:', error);
    cleanup();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[container-runner] Unhandled rejection:', reason);
    cleanup();
    process.exit(1);
  });

  process.on('exit', () => {
    cleanup();
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);