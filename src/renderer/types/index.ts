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

export interface AppSettings {
  githubToken: string;
  repositoryUrl: string;
  environmentMappings: Record<string, string>; // environment name -> branch name
  recentCommitDays: number; // Number of days to look back for recent deployed commits
  disabledEnvironments?: string[]; // List of environment names where deploy is disabled
}

export interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}
