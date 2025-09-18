const servers: Config = {
  servers: [
    {
      name: 'wcgw',
      command: 'uv',
      args: ['tool', 'run', '--python', '3.12', 'wcgw@5.4.3'],
    },
    // blocked by dependant
    // {
    //   name: 'computer',
    //   command: 'npx',
    //   args: ['-y', '@domdomegg/computer-use-mcp'],
    //
    // },
    {
      name: 'container',
      command: 'tsx',
      args: ['./src/servers/container-runner/index.ts'],
    },
    {
      name: 'time',
      command: 'uvx',
      args: ['mcp-server-time'],
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
