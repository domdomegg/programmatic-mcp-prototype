import { callMCPTool } from "../../client.js";

/**
 * [bash] 
 *                         Read the contents of multiple files simultaneously.
 *                         
 *                         Each file's content is returned with its path as a reference.
 *                         Handles text files normally and renders images as viewable content.
 *                         Recognized image types: PNG, JPEG, GIF, WebP.
 *                         
 *                         Failed reads for individual files won't stop the entire operation.
 *                         Only works within allowed directories.
 *                         
 *                         IMPORTANT: Always use absolute paths for reliability. Paths are automatically normalized regardless of slash direction. Relative paths may fail as they depend on the current working directory. Tilde paths (~/...) might not work in all contexts. Unless the user explicitly asks for relative paths, use absolute paths.
 *                         This command can be referenced as "DC: ..." or "use Desktop Commander to ..." in your instructions.
 * @param input - {"type":"object","properties":{"paths":{"type":"array","items":{"type":"string"}}},"required":["paths"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
 * @returns unknown
 */
export async function read_multiple_files(input: { paths: Array<string> }): Promise<unknown> {
    const result = await callMCPTool('bash__read_multiple_files', input);
      
      if (result.isError) {
        throw new Error(`Tool bash__read_multiple_files failed: ${result.content[0]?.text || 'Unknown error'}`);
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
