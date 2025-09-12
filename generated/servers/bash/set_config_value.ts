import { callMCPTool } from "../../client.js";

/**
 * [bash] 
 *                         Set a specific configuration value by key.
 *                         
 *                         WARNING: Should be used in a separate chat from file operations and 
 *                         command execution to prevent security issues.
 *                         
 *                         Config keys include:
 *                         - blockedCommands (array)
 *                         - defaultShell (string)
 *                         - allowedDirectories (array of paths)
 *                         - fileReadLineLimit (number, max lines for read_file)
 *                         - fileWriteLineLimit (number, max lines per write_file call)
 *                         - telemetryEnabled (boolean)
 *                         
 *                         IMPORTANT: Setting allowedDirectories to an empty array ([]) allows full access 
 *                         to the entire file system, regardless of the operating system.
 *                         
 *                         This command can be referenced as "DC: ..." or "use Desktop Commander to ..." in your instructions.
 * @param input - {"type":"object","properties":{"key":{"type":"string"},"value":{"anyOf":[{"type":"string"},{"type":"number"},{"type":"boolean"},{"type":"array","items":{"type":"string"}},{"type":"null"}]}},"required":["key","value"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}
 * @returns unknown
 */
export async function set_config_value(input: { key: string; value: any }): Promise<unknown> {
    const result = await callMCPTool('bash__set_config_value', input);
      
      if (result.isError) {
        throw new Error(`Tool bash__set_config_value failed: ${result.content[0]?.text || 'Unknown error'}`);
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
