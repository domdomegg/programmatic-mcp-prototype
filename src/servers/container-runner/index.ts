#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Dockerode from 'dockerode';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const docker = new Dockerode();

async function ensureDockerImage() {
  const images = await docker.listImages();
  const hasImage = images.some(img => 
    img.RepoTags?.includes('mcp-runner:latest')
  );

  if (!hasImage) {
    console.error('Building Docker image for code execution...');
    await docker.buildImage(
      {
        context: __dirname,
        src: ['Dockerfile'],
      },
      { t: 'mcp-runner:latest' }
    );
  }
}

async function executeInContainer(code: string, timeout: number = 30000): Promise<any> {
  const workDir = path.join(os.tmpdir(), `mcp-exec-${randomUUID()}`);
  await fs.mkdir(workDir, { recursive: true });
  
  try {
    const entryFile = path.join(workDir, 'index.ts');
    await fs.writeFile(entryFile, code);

    const packageJson = {
      type: 'module',
      dependencies: {
        '@modelcontextprotocol/sdk': '^1.18.0'
      }
    };
    await fs.writeFile(
      path.join(workDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    // Copy model accessible files (generated bindings, client, and workspace)
    await fs.cp('./model_accessible_files', path.join(workDir, 'model_accessible_files'), { recursive: true });
    await fs.cp('./tsconfig.json', path.join(workDir, 'tsconfig.json'));

    const container = await docker.createContainer({
      Image: 'mcp-runner:latest',
      Cmd: ['tsx', 'index.ts'],
      WorkingDir: '/workspace',
      HostConfig: {
        Binds: [
          `${workDir}:/workspace`,
          `${path.join(workDir, 'model_accessible_files', 'generated')}:/workspace/model_accessible_files/generated:ro`,
        ],
        Memory: 512 * 1024 * 1024,
        NetworkMode: 'none',
      },
      AttachStdout: true,
      AttachStderr: true,
    });

    await container.start();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Execution timeout')), timeout)
    );

    const execPromise = container.wait();
    const result = await Promise.race([execPromise, timeoutPromise]);

    const stdout = await container.logs({
      stdout: true,
      stderr: false,
      follow: false,
    });

    const stderr = await container.logs({
      stdout: false,
      stderr: true,
      follow: false,
    });

    await container.remove();

    return {
      stdout: stdout.toString(),
      stderr: stderr.toString(),
      exitCode: (result as any).StatusCode || 0,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
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
        description: 'Execute TypeScript code in an isolated Docker container with access to generated tool bindings',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'TypeScript code to execute. Can import generated tool bindings from ../generated',
            },
            timeout: {
              type: 'number',
              description: 'Execution timeout in milliseconds',
              default: 30000,
            },
          },
          required: ['code'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            stdout: { type: 'string' },
            stderr: { type: 'string' },
            exitCode: { type: 'number' },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== 'execute') {
      return {
        content: [{ type: 'text', text: 'Unknown tool' }],
        isError: true,
      };
    }

    const { code, timeout = 30000 } = request.params.arguments as any;

    try {
      const result = await executeInContainer(code, timeout);
      return {
        content: [],
        structuredContent: result,
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: error.message }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);