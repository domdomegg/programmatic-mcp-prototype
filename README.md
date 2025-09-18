# programmatic-mcp-prototype

An MCP-based agent with support for:
- progressive tool discovery
- programmatic tool composition
- state persistence
- skill building

## Architecture

- **Core Agent Loop**: Simple while loop that can be swapped with other implementations
- **MCP Proxy Server**: Aggregates multiple MCP servers into one unified interface
- **Code Generator**: Creates TypeScript bindings from MCP tool schemas
- **Container Runner**: Executes TypeScript code in isolated Docker containers

## Key Features

### 1. Progressive Tool Discovery
The model can search for and discover tools dynamically instead of loading all tools upfront. Rather than exposing hundreds of tools at once, the agent provides `search_tools` and `execute_tool` meta-tools that allow the model to find relevant tools as needed, reducing context usage and improving response quality.

### 2. Programmatic Tool Composition
The agent can write TypeScript code that composes MCP tools together:

```typescript
// Example: The model can write code like this
import * as bash from './generated/servers/bash';
import * as computer from './generated/servers/computer';

const files = await bash.ls({ path: './documents' });
for (const file of files) {
  const content = await bash.readFile({ path: file });
  console.log(`File ${file}: ${content.length} bytes`);
}
```

### 3. State Persistence
Store intermediate results and data in the workspace directory:

```typescript
import * as fs from 'fs/promises';

// Save CSV for later use
const csvData = await processData();
await fs.writeFile('./generated/workspace/data.csv', csvData);

// Load it in a future execution
const data = await fs.readFile('./generated/workspace/data.csv', 'utf-8');
```

### 4. Skill Building
Create reusable meta-tools that combine multiple operations:

```typescript
// Build a skill in ./generated/skills/
export async function saveSheetAsCsv(sheetId: string) {
  import * as sheets from '../servers/sheets';
  import * as bash from '../servers/bash';
  
  const data = await sheets.getCells({ sheetId });
  const csv = data.map(row => row.join(',')).join('\n');
  const path = `../workspace/sheet-${sheetId}.csv`;
  await bash.writeFile({ path, content: csv });
  return path;
}

// Use the skill later
import { saveSheetAsCsv } from './generated/skills/save-sheet-as-csv';
const csvPath = await saveSheetAsCsv('abc123');
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure your MCP servers in `config/servers.ts`

3. Set your Anthropic API key:
```bash
export ANTHROPIC_API_KEY='your-key'
```

4. Build Docker image for code execution:
```bash
docker build -t mcp-runner:latest src/servers/container-runner
```

## Usage

### Run the agent:
```bash
npm start
```

## How It Works

1. **Startup**: Connects to configured MCP servers (bash, computer, container)
2. **Code Generation**: Creates TypeScript functions for each tool with proper types
3. **Agent Loop**: Simple while loop that calls Claude with MCP tools
4. **Tool Execution**: Routes tool calls to appropriate backend MCP servers
5. **Code Execution**: Runs TypeScript in isolated Docker containers

## Benefits of Programmatic Tool Use

1. **Composition**: Chain multiple tools without waiting between calls
2. **State**: Store variables and reuse results
3. **Loops/Conditionals**: Handle complex logic in code
4. **Error Handling**: Try/catch and retry logic
5. **Efficiency**: Make many tool calls in one execution
6. **Skills Library**: Build reusable patterns over time
