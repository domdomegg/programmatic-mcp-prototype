#!/usr/bin/env node
import { MCPProxyServer } from './mcp-proxy/server.js';
import { CLIInterface } from './interfaces/cli.js';
import { HTTPInterface } from './interfaces/http.js';
import * as fs from 'fs/promises';

async function main() {
  const configModule = await import('../config/servers.js');
  const config = configModule.default;

  await fs.mkdir(config.paths.workspace, { recursive: true });
  await fs.mkdir(config.paths.skills, { recursive: true });

  const isProxyMode = process.argv.includes('--proxy');
  const isHTTPMode = process.argv.includes('--http');

  if (isProxyMode) {
    // Run as MCP proxy server for other clients
    const proxy = new MCPProxyServer(config);
    await proxy.initialize();
    console.error('MCP Proxy Server running on stdio');
  } else if (isHTTPMode) {
    // Run HTTP API server
    const proxy = new MCPProxyServer(config);
    await proxy.initialize();
    
    const httpInterface = new HTTPInterface(proxy, config, Number(process.env.PORT) || 3000);
    await httpInterface.start();
    
    process.on('SIGINT', () => {
      console.log('\nShutting down...');
      httpInterface.close();
      process.exit(0);
    });
  } else {
    // Run CLI interface
    const proxy = new MCPProxyServer(config);
    await proxy.initialize();
    
    const cliInterface = new CLIInterface(proxy, config);
    await cliInterface.run();
  }
}

main().catch(console.error);