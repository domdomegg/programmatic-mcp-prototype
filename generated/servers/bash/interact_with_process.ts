import { callMCPTool } from "../../client.js";

/**
 * [bash] 
 *                         Send input to a running process and automatically receive the response.
 *                         
 *                         CRITICAL: THIS IS THE PRIMARY TOOL FOR ALL LOCAL FILE ANALYSIS
 *                         For ANY local file analysis (CSV, JSON, data processing), ALWAYS use this instead of the analysis tool.
 *                         The analysis tool CANNOT access local files and WILL FAIL - use processes for ALL file-based work.
 *                         
 *                         FILE ANALYSIS PRIORITY ORDER (MANDATORY):
 *                         1. ALWAYS FIRST: Use this tool (start_process + interact_with_process) for local data analysis
 *                         2. ALTERNATIVE: Use command-line tools (cut, awk, grep) for quick processing  
 *                         3. NEVER EVER: Use analysis tool for local file access (IT WILL FAIL)
 *                         
 *                         REQUIRED INTERACTIVE WORKFLOW FOR FILE ANALYSIS:
 *                         1. Start REPL: start_process("python3 -i")
 *                         2. Load libraries: interact_with_process(pid, "import pandas as pd, numpy as np")
 *                         3. Read file: interact_with_process(pid, "df = pd.read_csv('/absolute/path/file.csv')")
 *                         4. Analyze: interact_with_process(pid, "print(df.describe())")
 *                         5. Continue: interact_with_process(pid, "df.groupby('column').size()")
 *                         
 *                         BINARY FILE PROCESSING WORKFLOWS:
 *                         Use appropriate Python libraries (PyPDF2, pandas, docx2txt, etc.) or command-line tools for binary file analysis.
 *                         
 *                         SMART DETECTION:
 *                         - Automatically waits for REPL prompt (>>>, >, etc.)
 *                         - Detects errors and completion states
 *                         - Early exit prevents timeout delays
 *                         - Clean output formatting (removes prompts)
 *                         
 *                         SUPPORTED REPLs:
 *                         - Python: python3 -i (RECOMMENDED for data analysis)
 *                         - Node.js: node -i  
 *                         - R: R
 *                         - Julia: julia
 *                         - Shell: bash, zsh
 *                         - Database: mysql, postgres
 *                         
 *                         PARAMETERS:
 *                         - pid: Process ID from start_process
 *                         - input: Code/command to execute
 *                         - timeout_ms: Max wait (default: 8000ms)
 *                         - wait_for_prompt: Auto-wait for response (default: true)
 *                         
 *                         Returns execution result with status indicators.
 *                         
 *                         ALWAYS USE FOR: CSV analysis, JSON processing, file statistics, data visualization prep, ANY local file work
 *                         NEVER USE ANALYSIS TOOL FOR: Local file access (it cannot read files from disk and WILL FAIL)
 *                         
 *                         This command can be referenced as "DC: ..." or "use Desktop Commander to ..." in your instructions.
 * @param input - {"type":"object","properties":{"pid":{"type":"number"},"input":{"type":"string"},"timeout_ms":{"type":"number"},"wait_for_prompt":{"type":"boolean"}},"required":["pid","input"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
 * @returns unknown
 */
export async function interact_with_process(input: { pid: number; input: string; timeout_ms?: number; wait_for_prompt?: boolean }): Promise<unknown> {
    const result = await callMCPTool('bash__interact_with_process', input);
      
      if (result.isError) {
        throw new Error(`Tool bash__interact_with_process failed: ${result.content[0]?.text || 'Unknown error'}`);
      }
      
      if (result.structuredContent) {
        return result.structuredContent as unknown;
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
}
