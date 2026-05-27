export interface EnvironmentInfo {
  name: string;
  branch: string;
  status: 'up-to-date' | 'pending-commits' | 'ahead-of-branch' | 'loading' | 'error';
  lastDeployedCommit: string | null;
  currentHeadCommit: string | null;
  commits: Commit[];
}
export interface Environment {
  name: string;
  branch: string;
  status: 'up-to-date' | 'pending-commits' | 'ahead-of-branch' | 'loading' | 'error';
  lastDeployedCommit: string | null;
  currentHeadCommit: string | null;
}

export interface Commit {
  hash: string;
  message: string;
  author: string;
  timestamp: string;
  deployed?: boolean; // Optional flag to indicate if commit is already deployed
}

export interface ActionRun {
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
  latestRun: ActionRun | null;
  estimatedDurationSeconds: number | null;
  successfulSampleSize: number;
  lastSuccessfulAt: string | null;
}

export interface AppSettings {
  githubToken: string;
  repositoryUrl: string;
  environmentMappings: Record<string, string>; // environment name -> branch name
  disabledEnvironments?: string[]; // List of environment names where deploy is disabled
}

export interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}
