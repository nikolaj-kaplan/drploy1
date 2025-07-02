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
}

export interface AppSettings {
  githubToken: string;
  repositoryUrl: string;
  environmentMappings: Record<string, string>; // environment name -> branch name
}

export interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}
