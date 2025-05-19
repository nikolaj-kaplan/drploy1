import { Commit, Environment, CommandResult } from '../types';

const { ipcRenderer } = window.require('electron');

export const GitService = {
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
  
  /**
   * Get commits between the current tag and HEAD
   */
  getCommitsBetweenTagAndHead: (env: string): Promise<Commit[]> => {
    return new Promise((resolve) => {
      ipcRenderer.once(`${env}-commits-retrieved`, (_, commits: Commit[]) => {
        resolve(commits);
      });
      
      ipcRenderer.send('get-commits-between-tag-and-head', env);
    });
  }
};
