const servers: Config = {
  servers: [
    {
      name: 'wcgw',
      command: 'uv',
      args: ['tool', 'run', '--python', '3.12', 'wcgw@5.4.3'],
      description: 'File system and bash command execution',
    },
    // blocked by dependant
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
    // needs auth
    // {
    //   name: 'asana',
    //   url: 'https://mcp.asana.com/sse',
    //   description: 'Asana project management integration',
    // },
    {
      name: 'context7',
      url: 'https://mcp.context7.com/mcp',
      description: 'Context7 integration',
    },
  ],
  paths: {
    workspace: './model_accessible_files/workspace',
    skills: './model_accessible_files/workspace/skills',
  },
} as const;

export type LocalServerConfig = {
  name: string;
  command: string;
  args: string[];
  description: string;
};

export type RemoteServerConfig = {
  name: string;
  url: string;
  description: string;
};

export type ServerConfig = LocalServerConfig | RemoteServerConfig;

export type Config = {
  servers: ServerConfig[];
  paths: {
    workspace: string;
    skills: string;
  };
};

export default servers;
