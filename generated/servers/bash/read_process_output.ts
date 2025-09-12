import { callMCPTool } from "../../client.js";

/**
 * [bash] 
 *                         Read output from a running process with intelligent completion detection.
 *                         
 *                         Automatically detects when process is ready for more input instead of timing out.
 *                         
 *                         SMART FEATURES:
 *                         - Early exit when REPL shows prompt (>>>, >, etc.)
 *                         - Detects process completion vs still running
 *                         - Prevents hanging on interactive prompts
 *                         - Clear status messages about process state
 *                         
 *                         REPL USAGE:
 *                         - Stops immediately when REPL prompt detected
 *                         - Shows clear status: waiting for input vs finished
 *                         - Shorter timeouts needed due to smart detection
 *                         - Works with Python, Node.js, R, Julia, etc.
 *                         
 *                         DETECTION STATES:
 *                         Process waiting for input (ready for interact_with_process)
 *                         Process finished execution
 *                         Timeout reached (may still be running)
 *                         
 *                         This command can be referenced as "DC: ..." or "use Desktop Commander to ..." in your instructions.
 * @param input - {"type":"object","properties":{"pid":{"type":"number"},"timeout_ms":{"type":"number"}},"required":["pid"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
 * @returns unknown
 */
export async function read_process_output(input: { pid: number; timeout_ms?: number }): Promise<unknown> {
    const result = await callMCPTool('bash__read_process_output', input);
      
      if (result.isError) {
        throw new Error(`Tool bash__read_process_output failed: ${result.content[0]?.text || 'Unknown error'}`);
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
