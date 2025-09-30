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
    await this.project.save();
  }

  private async generateServerFile(serverName: string, tools: Tool[]) {
    const serverDir = path.join('./model_accessible_files/generated/servers', serverName);
    await fs.mkdir(serverDir, { recursive: true });

    for (const tool of tools) {
      const toolName = this.sanitizeFunctionName(tool.name.replace(`${serverName}__`, ''));
      const fileName = `${toolName}.ts`;
      const filePath = path.join(serverDir, fileName);

      const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

      sourceFile.addImportDeclaration({
        moduleSpecifier: '../../../client.js',
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
        statements: `return callMCPTool<${outputType}>('${tool.name}', input);`,
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
      const toolName = this.sanitizeFunctionName(tool.name.replace(`${serverName}__`, ''));
      indexFile.addExportDeclaration({
        moduleSpecifier: `./${toolName}.js`,
        namedExports: [toolName],
      });
    }
  }

  private sanitizeFunctionName(name: string): string {
    // Replace invalid characters with underscores
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private async generateIndexFile(serverNames: string[]) {
    const indexFile = this.project.createSourceFile('./model_accessible_files/generated/index.ts', '', { overwrite: true });
    
    for (const serverName of serverNames) {
      indexFile.addExportDeclaration({
        moduleSpecifier: `./servers/${serverName}/index.js`,
        namespaceExport: serverName,
      });
    }
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