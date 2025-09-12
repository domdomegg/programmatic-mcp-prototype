# Skills Directory

This directory is for building reusable meta-tools that combine multiple MCP tools.

## Examples

### Data Processing Skill
```typescript
// skills/save-sheet-as-csv.ts
import * as sheets from '../servers/sheets';
import * as bash from '../servers/bash';

export async function saveSheetAsCsv(sheetId: string, outputPath: string) {
  const data = await sheets.getCells({ sheetId });
  const csv = data.map(row => row.join(',')).join('\n');
  await bash.writeFile({ path: outputPath, content: csv });
  return { path: outputPath, rows: data.length };
}
```

### Browser Automation Skill
```typescript
// skills/launch-chrome.ts
import * as bash from '../servers/bash';
import * as computer from '../servers/computer';

export async function launchChrome(url: string) {
  await bash.execute({ command: `open -a "Google Chrome" ${url}` });
  await new Promise(resolve => setTimeout(resolve, 2000));
  const screenshot = await computer.screenshot();
  return screenshot;
}
```

## Usage

1. Create TypeScript files in this directory
2. Import the generated tool bindings
3. The model can then import and use these skills in future executions
