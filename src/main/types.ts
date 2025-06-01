// Define the schema for our settings
export interface UserSettings {
  githubToken: string;
  repositoryUrl: string;
  environmentMappings: {
    [key: string]: string;
  };
}

// Define interfaces for our environment status and deployment tracking
export interface EnvironmentStatus {
  name: string;
  branch: string;
  status: string;
  lastDeployedCommit: string | null;
  currentHeadCommit: string | null;
  error?: string;
}

export interface DeploymentResult {
  name: string;
  deployed: boolean;
  output?: string;
  error?: string;
}

// Command queue for serializing Git operations
export interface QueuedCommand {
  command: string;
  cwd: string;
  resolve: (value: {
    success: boolean;
    output: string;
    error?: string;
  }) => void;
}

export interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}
