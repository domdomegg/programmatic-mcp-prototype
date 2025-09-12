/**
 * Example: Programmatic Tool Use Demo
 * 
 * This demonstrates how the model can write TypeScript code that:
 * 1. Uses multiple MCP tools programmatically
 * 2. Stores state in the workspace
 * 3. Creates reusable skills
 */

// Import generated tool bindings
import * as bash from '../generated/servers/bash';
import * as computer from '../generated/servers/computer';
import * as fs from 'fs/promises';

async function analyzeDisk() {
  // Get directory listing
  const files = await bash.ls({ path: '~/Documents' });
  
  // Calculate total size using multiple tool calls
  let totalSize = 0;
  const fileDetails = [];
  
  for (const file of files) {
    const stats = await bash.stat({ path: `~/Documents/${file}` });
    totalSize += stats.size;
    fileDetails.push({ name: file, size: stats.size });
  }
  
  // Store results in workspace for future use
  const report = {
    timestamp: new Date().toISOString(),
    totalFiles: files.length,
    totalSize,
    files: fileDetails.sort((a, b) => b.size - a.size)
  };
  
  await fs.writeFile(
    '../generated/workspace/disk-report.json',
    JSON.stringify(report, null, 2)
  );
  
  return report;
}

async function createSkill() {
  // Build a reusable skill for future use
  const skillCode = `
export async function quickScreenshot(filename: string) {
  import * as computer from '../servers/computer';
  import * as bash from '../servers/bash';
  
  const screenshot = await computer.screenshot();
  const path = \`../workspace/screenshots/\${filename}-\${Date.now()}.png\`;
  await bash.writeFile({ path, content: screenshot });
  
  return {
    success: true,
    path,
    timestamp: new Date().toISOString()
  };
}
`;

  await fs.writeFile(
    '../generated/skills/quick-screenshot.ts',
    skillCode
  );
  
  console.log('Created quick-screenshot skill!');
}

// Example of using structured output to compose tools
interface FileAnalysis {
  path: string;
  size: number;
  type: string;
}

async function analyzeWithTypes(path: string): Promise<FileAnalysis> {
  const stats = await bash.stat({ path });
  const file = await bash.file({ path }); // Get file type
  
  return {
    path,
    size: stats.size,
    type: file.mimeType
  };
}

// Main execution
async function main() {
  console.log('Running programmatic tool demo...\n');
  
  // 1. Analyze disk with multiple composed calls
  const diskReport = await analyzeDisk();
  console.log(`Found ${diskReport.totalFiles} files totaling ${diskReport.totalSize} bytes`);
  
  // 2. Create a reusable skill
  await createSkill();
  
  // 3. Use structured output for type safety
  const analysis = await analyzeWithTypes('~/Documents/important.pdf');
  console.log(`File analysis:`, analysis);
  
  console.log('\nDone! Check workspace for saved data.');
}

main().catch(console.error);