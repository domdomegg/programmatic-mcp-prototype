#!/usr/bin/env tsx
/**
 * Tool to interact with the running MCP agent
 */

import { spawn } from 'child_process';
import * as readline from 'readline';

async function interact() {
  console.log('Starting interactive MCP agent session...\n');

  // Start the agent process
  const agent = spawn('npx', ['tsx', 'src/index.ts'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env
  });

  let buffer = '';
  let isReady = false;

  // Handle output
  agent.stdout.on('data', (data) => {
    const text = data.toString();
    process.stdout.write(text);
    buffer += text;
    
    // Check if agent is ready for input
    if (text.includes('You:') && !isReady) {
      isReady = true;
      console.log('\nAgent is ready! You can now type your queries.\n');
    }
  });

  agent.stderr.on('data', (data) => {
    process.stderr.write(data.toString());
  });

  // Create readline interface for user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: ''
  });

  // Wait for agent to be ready
  await new Promise(resolve => {
    const checkReady = setInterval(() => {
      if (isReady) {
        clearInterval(checkReady);
        resolve(true);
      }
    }, 100);
  });

  // Send predefined test queries
  const testQueries = [
    'list the files in the current directory',
    'read the first 10 lines of README.md',
    'write TypeScript code that uses the bash tools to count how many .ts files are in this project'
  ];

  console.log('Sending test queries...\n');
  
  for (const query of testQueries) {
    console.log(`\n>>> Sending: ${query}`);
    agent.stdin.write(query + '\n');
    
    // Wait a bit for response
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  // Now allow manual input
  console.log('\n\nYou can now type your own queries (Ctrl+C to exit):\n');
  
  rl.on('line', (input) => {
    if (input.trim()) {
      agent.stdin.write(input + '\n');
    }
  });

  // Handle process termination
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    agent.kill();
    process.exit(0);
  });

  agent.on('close', (code) => {
    console.log(`Agent process exited with code ${code}`);
    process.exit(code || 0);
  });
}

interact().catch(console.error);