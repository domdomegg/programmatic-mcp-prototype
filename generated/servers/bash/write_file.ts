import { callMCPTool } from "../../client.js";

/**
 * [bash] 
 *                         Write or append to file contents. 
 *
 *                         CHUNKING IS STANDARD PRACTICE: Always write files in chunks of 25-30 lines maximum.
 *                         This is the normal, recommended way to write files - not an emergency measure.
 *
 *                         STANDARD PROCESS FOR ANY FILE:
 *                         1. FIRST → write_file(filePath, firstChunk, {mode: 'rewrite'})  [≤30 lines]
 *                         2. THEN → write_file(filePath, secondChunk, {mode: 'append'})   [≤30 lines]
 *                         3. CONTINUE → write_file(filePath, nextChunk, {mode: 'append'}) [≤30 lines]
 *
 *                         ALWAYS CHUNK PROACTIVELY - don't wait for performance warnings!
 *
 *                         WHEN TO CHUNK (always be proactive):
 *                         1. Any file expected to be longer than 25-30 lines
 *                         2. When writing multiple files in sequence
 *                         3. When creating documentation, code files, or configuration files
 *                         
 *                         HANDLING CONTINUATION ("Continue" prompts):
 *                         If user asks to "Continue" after an incomplete operation:
 *                         1. Read the file to see what was successfully written
 *                         2. Continue writing ONLY the remaining content using {mode: 'append'}
 *                         3. Keep chunks to 25-30 lines each
 *                         
 *                         Files over 50 lines will generate performance notes but are still written successfully.
 *                         Only works within allowed directories.
 *                         
 *                         IMPORTANT: Always use absolute paths for reliability. Paths are automatically normalized regardless of slash direction. Relative paths may fail as they depend on the current working directory. Tilde paths (~/...) might not work in all contexts. Unless the user explicitly asks for relative paths, use absolute paths.
 *                         This command can be referenced as "DC: ..." or "use Desktop Commander to ..." in your instructions.
 * @param input - {"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"},"mode":{"type":"string","enum":["rewrite","append"],"default":"rewrite"}},"required":["path","content"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
 * @returns unknown
 */
export async function write_file(input: { path: string; content: string; mode?: string }): Promise<unknown> {
    const result = await callMCPTool('bash__write_file', input);
      
      if (result.isError) {
        throw new Error(`Tool bash__write_file failed: ${result.content[0]?.text || 'Unknown error'}`);
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
