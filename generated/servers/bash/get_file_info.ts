import { callMCPTool } from "../../client.js";

/**
 * [bash] 
 *                         Retrieve detailed metadata about a file or directory including:
 *                         - size
 *                         - creation time
 *                         - last modified time 
 *                         - permissions
 *                         - type
 *                         - lineCount (for text files)
 *                         - lastLine (zero-indexed number of last line, for text files)
 *                         - appendPosition (line number for appending, for text files)
 *                         
 *                         Only works within allowed directories.
 *                         
 *                         IMPORTANT: Always use absolute paths for reliability. Paths are automatically normalized regardless of slash direction. Relative paths may fail as they depend on the current working directory. Tilde paths (~/...) might not work in all contexts. Unless the user explicitly asks for relative paths, use absolute paths.
 *                         This command can be referenced as "DC: ..." or "use Desktop Commander to ..." in your instructions.
 * @param input - {"type":"object","properties":{"path":{"type":"string"}},"required":["path"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
 * @returns unknown
 */
export async function get_file_info(input: { path: string }): Promise<unknown> {
    const result = await callMCPTool('bash__get_file_info', input);
      
      if (result.isError) {
        throw new Error(`Tool bash__get_file_info failed: ${result.content[0]?.text || 'Unknown error'}`);
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
