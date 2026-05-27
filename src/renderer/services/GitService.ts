import { ActionRun, Commit, Environment, CommandResult, EnvironmentDeploySummary, EnvironmentInfo } from '../types';
const { ipcRenderer } = window.require('electron');

interface ActionRunsResult {
  success: boolean;
  runs: ActionRun[];
  error?: string;
}

interface EnvironmentDeploySummariesResult {
  success: boolean;
  summaries: EnvironmentDeploySummary[];
  error?: string;
}

export const GitService = {
  /**
   * Get older deployed commits for an environment (pagination)
   */
  getOlderDeployedCommits: (env: string, limit = 10, offset = 0): Promise<Commit[]> => {
    return new Promise((resolve) => {
      ipcRenderer.once(`${env}-older-deployed-commits`, (_, commits: Commit[]) => {
        resolve(commits);
      });
      ipcRenderer.send('get-older-deployed-commits', { env, limit, offset });
    });
  },
  /**
   * Initialize with a GitHub token and repository URL
   */
  initializeRepository: (token: string, url: string): Promise<CommandResult> => {
    return new Promise((resolve) => {
      ipcRenderer.once('repo-initialized', (_, result: CommandResult) => {
        resolve(result);
      });
      ipcRenderer.send('initialize-repository', { token, url });
    });
  },
  /**
   * Get all info for a specific environment (status, SHAs, commits)
   */
  getEnvironmentInfo: (env: string): Promise<EnvironmentInfo> => {
    return new Promise((resolve) => {
      ipcRenderer.once(`${env}-info-retrieved`, (_, info: EnvironmentInfo) => {
        resolve(info);
      });
      ipcRenderer.send('get-environment-info', env);
    });
  },
  
  /**
   * Get the status for a specific environment
   */
  getEnvironmentStatus: (env: string): Promise<CommandResult> => {
    return new Promise((resolve) => {
      ipcRenderer.once(`${env}-status-checked`, (_, result: CommandResult) => {
        resolve(result);
      });
      
      ipcRenderer.send('check-environment-status', env);
    });
  },
  
  /**
   * Get the status for all environments
   */
  getAllEnvironmentsStatus: (): Promise<CommandResult> => {
    return new Promise((resolve) => {
      ipcRenderer.once('all-environments-checked', (_, result: CommandResult) => {
        resolve(result);
      });
      
      ipcRenderer.send('check-all-environments');
    });
  },
  
  /**
   * Deploy to a specific environment by tagging the current HEAD
   */
  deployToEnvironment: (env: string): Promise<CommandResult> => {
    return new Promise((resolve) => {
      ipcRenderer.once(`${env}-deployed`, (_, result: CommandResult) => {
        resolve(result);
      });
      
      ipcRenderer.send('deploy-to-environment', env);
    });
  },
  
  /**
   * Deploy to all out-of-date environments
   */
  deployToAllOutdatedEnvironments: (): Promise<CommandResult> => {
    return new Promise((resolve) => {
      ipcRenderer.once('all-outdated-deployed', (_, result: CommandResult) => {
        resolve(result);
      });
      
      ipcRenderer.send('deploy-all-outdated');
    });
  },

  getActionRuns: (limit = 20): Promise<ActionRunsResult> => {
    return new Promise((resolve) => {
      ipcRenderer.once('action-runs-retrieved', (_, result: ActionRunsResult) => {
        resolve(result);
      });

      ipcRenderer.send('get-action-runs', limit);
    });
  },

  getEnvironmentDeploySummaries: (limit = 40): Promise<EnvironmentDeploySummariesResult> => {
    return new Promise((resolve) => {
      ipcRenderer.once('environment-deploy-summaries-retrieved', (_, result: EnvironmentDeploySummariesResult) => {
        resolve(result);
      });

      ipcRenderer.send('get-environment-deploy-summaries', limit);
    });
  },
  
  /**
   * Get commits between the current tag and HEAD
   */
  getCommitsBetweenTagAndHead: (env: string, deployedLimit = 10, deployedOffset = 0): Promise<Commit[]> => {
    return new Promise((resolve) => {
      ipcRenderer.once(`${env}-commits-retrieved`, (_, commits: Commit[]) => {
        resolve(commits);
      });
      ipcRenderer.send('get-commits-between-tag-and-head', { env, deployedLimit, deployedOffset });
    });
  }
};
