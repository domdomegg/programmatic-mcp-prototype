const servers: Config = {
  servers: [
    {
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
    },
    {
      name: 'bash',
      command: 'tsx',
      args: ['../bash-executor/index.ts'],
    },
    {
      name: 'time',
      command: 'uvx',
      args: ['mcp-server-time@2025.8.4', '--local-timezone', 'UTC'],
    },
    {
      name: 'asana',
      url: 'https://mcp.asana.com/sse',
      transport: 'sse',
    },
    {
      name: 'context7',
      url: 'https://mcp.context7.com/mcp',
      transport: 'http',
    },
    {
      name: 'awsknowledge',
      url: 'https://knowledge-mcp.global.api.aws',
      transport: 'http',
    }
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
};

export type RemoteServerConfig = {
  name: string;
  url: string;
  transport: 'sse' | 'http';
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
