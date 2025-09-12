const servers: Config = {
  servers: [
    {
      name: 'bash',
      command: 'npx',
      args: ['-y', '@wonderwhy-er/desktop-commander'],
      description: 'File system and bash command execution',
    },
    // {
    //   name: 'computer',
    //   command: 'npx',
    //   args: ['-y', '@domdomegg/computer-use-mcp'],
    //   description: 'Computer use (screenshots, mouse, keyboard)',
    // },
    {
      name: 'container',
      command: 'tsx',
      args: ['./src/servers/container-runner/index.ts'],
      description: 'Execute TypeScript in isolated container',
    },
  ],
  paths: {
    workspace: './generated/workspace',
    skills: './generated/skills',
  },
} as const;

export type ServerConfig = {
  name: string;
  command: string;
  args: string[];
  description: string;
};

export type Config = {
  servers: ServerConfig[];
  paths: {
    workspace: string;
    skills: string;
  };
};

export default servers;
