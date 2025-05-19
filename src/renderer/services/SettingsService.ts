import { AppSettings } from '../types';

const { ipcRenderer } = window.require('electron');

export const SettingsService = {
  /**
   * Save settings to electron-store
   */
  saveSettings: (settings: AppSettings): Promise<boolean> => {
    return new Promise((resolve) => {
      ipcRenderer.once('settings-saved', (_, success: boolean) => {
        resolve(success);
      });
      
      ipcRenderer.send('save-settings', settings);
    });
  },
  
  /**
   * Load settings from electron-store
   */
  loadSettings: (): Promise<AppSettings | null> => {
    return new Promise((resolve) => {
      ipcRenderer.once('settings-loaded', (_, settings: AppSettings | null) => {
        resolve(settings);
      });
      
      ipcRenderer.send('load-settings');
    });
  },
  
  /**
   * Update environment to branch mapping
   */
  updateEnvironmentMapping: (env: string, branch: string): Promise<boolean> => {
    return new Promise((resolve) => {
      ipcRenderer.once('mapping-updated', (_, success: boolean) => {
        resolve(success);
      });
      
      ipcRenderer.send('update-environment-mapping', { env, branch });
    });
  }
};
