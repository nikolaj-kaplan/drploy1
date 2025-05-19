// This file is just for reference of the electron-store API

import Store from 'electron-store';

interface UserSettings {
  githubToken: string;
  repositoryUrl: string;
  environmentMappings: {
    [key: string]: string;
  };
}

const store = new Store<UserSettings>({
  defaults: {
    githubToken: '',
    repositoryUrl: '',
    environmentMappings: {
      'dev-test': 'develop',
      'test': 'release/test',
      'preprod': 'release/candidate',
      'prod': 'master'
    }
  }
});

// Example usage
// Get all settings
const allSettings = store.store;

// Set all settings
store.store = {
  githubToken: 'token123',
  repositoryUrl: 'https://github.com/user/repo',
  environmentMappings: {
    'dev': 'develop'
  }
};

// Get a specific setting
const token = store.get('githubToken');

// Set a specific setting
store.set('githubToken', 'newToken');

// Set a nested setting
store.set('environmentMappings.dev', 'main');
