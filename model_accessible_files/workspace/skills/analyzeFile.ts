#!/usr/bin/env tsx
/**
 * Example standalone CLI tool that can be run with: tsx example-cli-tool.ts <file-path>
 * This demonstrates a skill that can be invoked directly from the command line
 */
import * as servers from '../../generated/index.js';

async function analyzeFile(filePath: string) {
  // Read the file
  const content = await servers.filesystem.read_file({ path: filePath }) as string;
  
  // Analyze it
  const lines = content.split('\\n');
  const wordCount = content.split(/\\s+/).length;
  const charCount = content.length;
  
  console.log(JSON.stringify({
    lines: lines.length,
    words: wordCount,
    chars: charCount,
    blank_lines: lines.filter(l => l.trim() === '').length
  }));
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: tsx example-cli-tool.ts <file-path>');
    process.exit(1);
  }
  
  analyzeFile(filePath).catch(console.error);
}