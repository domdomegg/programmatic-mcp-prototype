# Workspace Directory

This directory is the model's workspace for executing code and storing data.

## Structure

- `skills/` - Contains reusable meta-tools that combine multiple MCP tools
- Other files and directories created by the model during execution

## Purpose

The workspace serves as an isolated environment where:
1. The model can write and execute code
2. Skills can be created to combine multiple tools into higher-level operations  
3. Temporary files and data can be stored during task execution

## Skills

Skills are TypeScript modules that import and combine the generated MCP tool bindings to create more complex, reusable operations. See `skills/README.md` for examples and documentation.