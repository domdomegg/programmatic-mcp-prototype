import { callMCPTool } from "../../client.js";

/**
 * [bash] 
 *                         Start a new terminal process with intelligent state detection.
 *                         
 *                         PRIMARY TOOL FOR FILE ANALYSIS AND DATA PROCESSING
 *                         This is the ONLY correct tool for analyzing local files (CSV, JSON, logs, etc.).
 *                         The analysis tool CANNOT access local files and WILL FAIL - always use processes for file-based work.
 *                         
 *                         CRITICAL RULE: For ANY local file work, ALWAYS use this tool + interact_with_process, NEVER use analysis/REPL tool.
 *                         
 *                         Running on macOS. Default shell: zsh.
 *         
 * MACOS-SPECIFIC NOTES:
 * - Package manager: brew (Homebrew) is commonly used
 * - Python 3 might be 'python3' command, not 'python'
 * - Some GNU tools have different names (e.g., gsed instead of sed)
 * - System Integrity Protection (SIP) may block certain operations
 * - Use 'open' command to open files/applications from terminal
 * - For file search: Use mdfind (Spotlight) for fastest exact filename searches
 *                         
 *                         REQUIRED WORKFLOW FOR LOCAL FILES:
 *                         1. start_process("python3 -i") - Start Python REPL for data analysis
 *                         2. interact_with_process(pid, "import pandas as pd, numpy as np")
 *                         3. interact_with_process(pid, "df = pd.read_csv('/absolute/path/file.csv')")
 *                         4. interact_with_process(pid, "print(df.describe())")
 *                         5. Continue analysis with pandas, matplotlib, seaborn, etc.
 *                         
 *                         COMMON FILE ANALYSIS PATTERNS:
 *                         • start_process("python3 -i") → Python REPL for data analysis (RECOMMENDED)
 *                         • start_process("node -i") → Node.js for JSON processing  
 *                         • start_process("cut -d',' -f1 file.csv | sort | uniq -c") → Quick CSV analysis
 *                         • start_process("wc -l /path/file.csv") → Line counting
 *                         • start_process("head -10 /path/file.csv") → File preview
 *                         
 *                         BINARY FILE SUPPORT:
 *                         For PDF, Excel, Word, archives, databases, and other binary formats, use process tools with appropriate libraries or command-line utilities.
 *                         
 *                         INTERACTIVE PROCESSES FOR DATA ANALYSIS:
 *                         1. start_process("python3 -i") - Start Python REPL for data work
 *                         2. start_process("node -i") - Start Node.js REPL for JSON/JS
 *                         3. start_process("bash") - Start interactive bash shell
 *                         4. Use interact_with_process() to send commands
 *                         5. Use read_process_output() to get responses
 *                         
 *                         SMART DETECTION:
 *                         - Detects REPL prompts (>>>, >, $, etc.)
 *                         - Identifies when process is waiting for input
 *                         - Recognizes process completion vs timeout
 *                         - Early exit prevents unnecessary waiting
 *                         
 *                         STATES DETECTED:
 *                         Process waiting for input (shows prompt)
 *                         Process finished execution  
 *                         Process running (use read_process_output)
 *                         
 *                         ALWAYS USE FOR: Local file analysis, CSV processing, data exploration, system commands
 *                         NEVER USE ANALYSIS TOOL FOR: Local file access (analysis tool is browser-only and WILL FAIL)
 *                         
 *                         IMPORTANT: Always use absolute paths for reliability. Paths are automatically normalized regardless of slash direction. Relative paths may fail as they depend on the current working directory. Tilde paths (~/...) might not work in all contexts. Unless the user explicitly asks for relative paths, use absolute paths.
 *                         This command can be referenced as "DC: ..." or "use Desktop Commander to ..." in your instructions.
 * @param input - {"type":"object","properties":{"command":{"type":"string"},"timeout_ms":{"type":"number"},"shell":{"type":"string"}},"required":["command","timeout_ms"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
 * @returns unknown
 */
export async function start_process(input: { command: string; timeout_ms: number; shell?: string }): Promise<unknown> {
    const result = await callMCPTool('bash__start_process', input);
      
      if (result.isError) {
        throw new Error(`Tool bash__start_process failed: ${result.content[0]?.text || 'Unknown error'}`);
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
