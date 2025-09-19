#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn } from 'child_process';

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
      await new Promise(resolve => setTimeout(resolve, retryDelay));
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

async function resetContainer() {
  if (globalContainerId) {
    try {
      await runDockerCommand(['stop', globalContainerId]);
    } catch {}
    globalContainerId = null;
  }
  // Don't delete workspace folder - it contains user data
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
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
      // Return what we have so far instead of rejecting
      console.error(`[container-runner] Command timed out. stdout: ${stdout.substring(0, 200)}, stderr: ${stderr.substring(0, 200)}`);
      reject(new Error(`Docker command timed out. stderr: ${stderr.substring(0, 500)}`));
    }, timeout);

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (!timedOut) {
        resolve({
          stdout,
          stderr,
          exitCode: code || 0,
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function main() {
  await ensureDockerImage();

  const server = new Server(
    {
      name: 'container-runner',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'execute',
        description: 'Execute TypeScript code in an isolated Docker container with access to MCP tools',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'TypeScript code to execute. Can import MCP tools from model_accessible_files',
            },
            timeout: {
              type: 'number',
              description: 'Execution timeout in milliseconds',
              default: 30000,
            },
          },
          required: ['code'],
        },
      },
      {
        name: 'list_tools',
        description: 'List all available MCP tools from the container proxy',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'reset',
        description: 'Reset the container (clears all state and restarts)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    console.error(`[container-runner] Received tool call: ${request.params.name}`);

    if (request.params.name === 'reset') {
      try {
        await resetContainer();
        return {
          content: [{ type: 'text', text: 'Container reset successfully' }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        };
      }
    }

    if (request.params.name === 'list_tools') {
      try {
        // Ensure container is running and proxy client is connected
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

        const tools = toolsResponse.tools || [];

        return {
          content: [{ type: 'text', text: JSON.stringify(tools, null, 2) }],
          structuredContent: { tools },
        };
      } catch (error) {
        console.error('[container-runner] list_tools error:', error);
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }

    if (request.params.name !== 'execute') {
      return {
        content: [{ type: 'text', text: 'Unknown tool' }],
        isError: true,
      };
    }

    const { code, timeout = 30000 } = request.params.arguments as { code: string; timeout?: number };

    try {
      const result = await executeInContainer(code, timeout);

      // Format output for Claude to see
      let output = '';
      if (result.stdout) {
        output += `stdout:\n${result.stdout}\n`;
      }
      if (result.stderr) {
        output += `stderr:\n${result.stderr}\n`;
      }
      output += `exit code: ${result.exitCode}`;

      return {
        content: [{ type: 'text', text: output }],
        structuredContent: result,
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      };
    }
  });

  // Cleanup on exit
  const cleanup = async () => {
    console.error('[container-runner] Cleaning up...');
    await resetContainer();
  };

  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(0);
  });

  // Synchronous cleanup for process exit
  process.on('beforeExit', () => {
    if (globalContainerId) {
      // Best effort cleanup - can't await here
      spawn('docker', ['stop', globalContainerId]).unref();
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);