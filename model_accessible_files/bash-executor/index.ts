#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

const workingDir = process.argv[2] || process.cwd();

const server = new McpServer({
  name: 'bash-executor',
  version: '1.0.0',
});

server.registerTool(
  'execute',
  {
    description: 'Execute a bash command and return the output. Commands run in the specified working directory.',
    inputSchema: {
      command: z.string().describe('The bash command to execute'),
      timeout: z.number().optional().default(30000).describe('Timeout in milliseconds (default: 30000)'),
    },
    outputSchema: {
      stdout: z.string().describe('Standard output from the command'),
      stderr: z.string().describe('Standard error from the command'),
      exitCode: z.number().describe('Exit code of the command (0 for success)'),
    },
  },
  async ({ command, timeout }) => {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workingDir,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      });

      const result = {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error: any) {
      const result = {
        stdout: error.stdout?.trim() || '',
        stderr: error.stderr?.trim() || error.message,
        exitCode: error.code || 1,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
        isError: error.code !== 0,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Bash Executor MCP Server running on stdio');
  console.error(`Working directory: ${workingDir}`);
}

main().catch(console.error);