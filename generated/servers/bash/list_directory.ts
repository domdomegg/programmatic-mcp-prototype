import { callMCPTool } from "../../client.js";

/**
 * [bash] 
 *                         Get a detailed listing of all files and directories in a specified path.
 *                         
 *                         Use this instead of 'execute_command' with ls/dir commands.
 *                         Results distinguish between files and directories with [FILE] and [DIR] prefixes.
 *                         Only works within allowed directories.
 *                         
 *                         IMPORTANT: Always use absolute paths for reliability. Paths are automatically normalized regardless of slash direction. Relative paths may fail as they depend on the current working directory. Tilde paths (~/...) might not work in all contexts. Unless the user explicitly asks for relative paths, use absolute paths.
 *                         This command can be referenced as "DC: ..." or "use Desktop Commander to ..." in your instructions.
 * @param input - {"type":"object","properties":{"path":{"type":"string"}},"required":["path"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
 * @returns unknown
 */
export async function list_directory(input: { path: string }): Promise<unknown> {
    const result = await callMCPTool('bash__list_directory', input);
      
      if (result.isError) {
        throw new Error(`Tool bash__list_directory failed: ${result.content[0]?.text || 'Unknown error'}`);
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
