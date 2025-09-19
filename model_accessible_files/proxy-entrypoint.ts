#!/usr/bin/env node
/**
 * Proxy entrypoint for container
 *
 * This runs ToolProxy in the container and connects to all backend MCP servers.
 * User code connects to this proxy via stdio.
 */

import { ToolProxy } from './tool-proxy.js';

async function main() {
  const configModule = await import('./config/servers.js');
  const config = configModule.default;

  const toolProxy = new ToolProxy(config);
  await toolProxy.initialize();
  await toolProxy.connectStdio();
}

main().catch((error) => {
  console.error('Proxy entrypoint error:', error);
  process.exit(1);
});