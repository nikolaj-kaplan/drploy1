// Define the schema for our settings
export interface UserSettings {
  githubToken: string;
  repositoryUrl: string;
  environmentMappings: {
    [key: string]: string;
  };
  recentCommitDays: number; // Number of days to look back for recent deployed commits
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

export interface ActionRunSummary {
  id: number;
  runNumber: number;
  workflowName: string;
  displayTitle: string;
  event: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  headBranch: string | null;
  headSha: string | null;
  environment: string | null;
  createdAt: string;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  isActive: boolean;
}

export interface EnvironmentDeploySummary {
  environment: string;
  latestRun: ActionRunSummary | null;
  estimatedDurationSeconds: number | null;
  successfulSampleSize: number;
  lastSuccessfulAt: string | null;
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
