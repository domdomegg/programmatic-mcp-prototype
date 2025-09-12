import { Project, VariableDeclarationKind } from 'ts-morph';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class CodeGenerator {
  private project: Project;

  constructor(private paths: { workspace: string; skills: string }) {
    this.project = new Project({
      tsConfigFilePath: './tsconfig.json',
      skipAddingFilesFromTsConfig: true,
    });
  }

  async generateFromTools(tools: Map<string, Tool>) {
    const serverMap = new Map<string, Tool[]>();
    
    for (const [fullName, tool] of tools) {
      const [serverName] = fullName.split('__');
      if (!serverMap.has(serverName)) {
        serverMap.set(serverName, []);
      }
      serverMap.get(serverName)!.push(tool);
    }

    for (const [serverName, serverTools] of serverMap) {
      await this.generateServerFile(serverName, serverTools);
    }

    await this.generateIndexFile(Array.from(serverMap.keys()));
    await this.generateSkillsReadme();
    await this.project.save();
  }

  private async generateServerFile(serverName: string, tools: Tool[]) {
    const serverDir = path.join('./generated/servers', serverName);
    await fs.mkdir(serverDir, { recursive: true });

    for (const tool of tools) {
      const toolName = tool.name.replace(`${serverName}__`, '');
      const fileName = `${toolName}.ts`;
      const filePath = path.join(serverDir, fileName);

      const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

      sourceFile.addImportDeclaration({
        moduleSpecifier: '../../client.js',
        namedImports: ['callMCPTool'],
      });

      const inputType = this.schemaToTypeString(tool.inputSchema);
      const outputType = tool.outputSchema 
        ? this.schemaToTypeString(tool.outputSchema)
        : 'unknown';

      sourceFile.addFunction({
        name: toolName,
        isExported: true,
        isAsync: true,
        parameters: [
          {
            name: 'input',
            type: inputType,
          },
        ],
        returnType: `Promise<${outputType}>`,
        statements: `
  const result = await callMCPTool('${tool.name}', input);
  
  if (result.isError) {
    throw new Error(\`Tool ${tool.name} failed: \${result.content[0]?.text || 'Unknown error'}\`);
  }
  
  if (result.structuredContent) {
    return result.structuredContent as ${outputType};
  }
  
  const textContent = result.content.find(c => c.type === 'text');
  if (textContent && textContent.type === 'text') {
    try {
      return JSON.parse(textContent.text);
    } catch {
      return textContent.text as any;
    }
  }
  
  return undefined as any;
        `.trim(),
      });

      // Add JSDoc comment
      const func = sourceFile.getFunction(toolName)!;
      func.addJsDoc({
        description: tool.description,
        tags: [
          { tagName: 'param', text: `input - ${JSON.stringify(tool.inputSchema)}` },
          { tagName: 'returns', text: tool.outputSchema ? JSON.stringify(tool.outputSchema) : 'unknown' }
        ]
      });
    }

    const indexPath = path.join(serverDir, 'index.ts');
    const indexFile = this.project.createSourceFile(indexPath, '', { overwrite: true });
    
    for (const tool of tools) {
      const toolName = tool.name.replace(`${serverName}__`, '');
      indexFile.addExportDeclaration({
        moduleSpecifier: `./${toolName}.js`,
        namedExports: [toolName],
      });
    }
  }

  private async generateIndexFile(serverNames: string[]) {
    const indexFile = this.project.createSourceFile('./generated/index.ts', '', { overwrite: true });
    
    for (const serverName of serverNames) {
      indexFile.addExportDeclaration({
        moduleSpecifier: `./servers/${serverName}/index.js`,
        namespaceExport: serverName,
      });
    }
  }

  private async generateSkillsReadme() {
    const readmePath = path.join(this.paths.skills, 'README.md');
    const content = `# Skills Directory

This directory is for building reusable meta-tools that combine multiple MCP tools.

## Examples

### Data Processing Skill
\`\`\`typescript
// skills/save-sheet-as-csv.ts
import * as sheets from '../servers/sheets';
import * as bash from '../servers/bash';

export async function saveSheetAsCsv(sheetId: string, outputPath: string) {
  const data = await sheets.getCells({ sheetId });
  const csv = data.map(row => row.join(',')).join('\\n');
  await bash.writeFile({ path: outputPath, content: csv });
  return { path: outputPath, rows: data.length };
}
\`\`\`

### Browser Automation Skill
\`\`\`typescript
// skills/launch-chrome.ts
import * as bash from '../servers/bash';
import * as computer from '../servers/computer';

export async function launchChrome(url: string) {
  await bash.execute({ command: \`open -a "Google Chrome" \${url}\` });
  await new Promise(resolve => setTimeout(resolve, 2000));
  const screenshot = await computer.screenshot();
  return screenshot;
}
\`\`\`

## Usage

1. Create TypeScript files in this directory
2. Import the generated tool bindings
3. The model can then import and use these skills in future executions
`;
    await fs.writeFile(readmePath, content);
  }

  private schemaToTypeString(schema: any): string {
    if (!schema) return 'any';
    
    if (schema.type === 'object') {
      if (!schema.properties) return 'Record<string, any>';
      
      const props = Object.entries(schema.properties)
        .map(([key, value]: [string, any]) => {
          const optional = !schema.required?.includes(key) ? '?' : '';
          const type = this.schemaToTypeString(value);
          return `${key}${optional}: ${type}`;
        })
        .join('; ');
      
      return `{ ${props} }`;
    }
    
    if (schema.type === 'array') {
      const itemType = this.schemaToTypeString(schema.items);
      return `Array<${itemType}>`;
    }
    
    const typeMap: Record<string, string> = {
      string: 'string',
      number: 'number',
      integer: 'number',
      boolean: 'boolean',
      null: 'null',
    };
    
    return typeMap[schema.type] || 'any';
  }
}