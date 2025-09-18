#!/usr/bin/env tsx
/**
 * Example standalone CLI tool that can be run with: tsx example-cli-tool.ts <file-path>
 * This demonstrates a skill that can be invoked directly from the command line
 */
import * as wcgw from '../../generated/servers/wcgw/index.js';
import * as container from '../../generated/servers/container/index.js';

async function analyzeFile(filePath: string) {
  // Read the file
  const content = await wcgw.ReadFiles({ file_paths: [filePath] });
  
  // Analyze it in a container
  const analysisCode = `
    const content = ${JSON.stringify(content)};
    const lines = content.split('\\n');
    const wordCount = content.split(/\\s+/).length;
    const charCount = content.length;
    
    console.log(JSON.stringify({
      lines: lines.length,
      words: wordCount,
      chars: charCount,
      blank_lines: lines.filter(l => l.trim() === '').length
    }));
  `;
  
  const result = await container.execute({
    code: analysisCode,
    timeout: 5000,
  });
  
  if (result.exitCode === 0 && result.stdout) {
    const stats = JSON.parse(result.stdout.trim());
    console.log(`File: ${filePath}`);
    console.log(`Lines: ${stats.lines}`);
    console.log(`Words: ${stats.words}`);
    console.log(`Characters: ${stats.chars}`);
    console.log(`Blank lines: ${stats.blank_lines}`);
  } else {
    console.error('Analysis failed:', result.stderr);
  }
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