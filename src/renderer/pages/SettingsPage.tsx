import React, { useState, useEffect } from 'react';
import { AppSettings } from '../types';
import { SettingsService } from '../services/SettingsService';

interface SettingsPageProps {
  onClose: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onClose }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  
  // New environment mapping fields
  const [newEnvName, setNewEnvName] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await SettingsService.loadSettings();
        setSettings(settings);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to load settings:', error);
        setError('Failed to load settings');
        setIsLoading(false);
      }
    };
    
    loadSettings();
  }, []);
  
  const handleSaveSettings = async () => {
    if (!settings) return;
    
    try {
      const result = await SettingsService.saveSettings(settings);
      
      if (result) {
        setMessage('Settings saved successfully');
        setTimeout(() => setMessage(null), 3000); // Clear message after 3 seconds
      } else {
        setError('Failed to save settings');
        setTimeout(() => setError(null), 3000);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setError('An unexpected error occurred');
      setTimeout(() => setError(null), 3000);
    }
  };
  
  const handleUpdateMapping = (env: string, branch: string) => {
    if (!settings) return;
    
    setSettings({
      ...settings,
      environmentMappings: {
        ...settings.environmentMappings,
        [env]: branch
      }
    });
  };
  
  const handleAddMapping = () => {
    if (!settings || !newEnvName || !newBranchName) return;
    
    // Update the settings object
    setSettings({
      ...settings,
      environmentMappings: {
        ...settings.environmentMappings,
        [newEnvName]: newBranchName
      }
    });
    
    // Clear the input fields
    setNewEnvName('');
    setNewBranchName('');
  };
  
  const handleDeleteMapping = (env: string) => {
    if (!settings) return;
    
    const updatedMappings = { ...settings.environmentMappings };
    delete updatedMappings[env];
    
    setSettings({
      ...settings,
      environmentMappings: updatedMappings
    });
  };
  
  if (isLoading) {
    return <div className="loading">Loading settings...</div>;
  }
  
  if (!settings) {
    return (
      <div className="settings-error">
        <h2>Settings Error</h2>
        <p>Could not load settings. Please try again later.</p>
        <button onClick={onClose}>Back to Dashboard</button>
      </div>
    );
  }
    return (
    <div className="settings-page">
      <section className="settings-section">
        <h2>GitHub Authentication</h2>
        <div className="form-group">
          <label htmlFor="token">GitHub Personal Access Token:</label>
          <input
            id="token"
            type="password"
            value={settings.githubToken}
            onChange={(e) => setSettings({ ...settings, githubToken: e.target.value })}
            placeholder="Enter your GitHub PAT"
            className="form-control"
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="repoUrl">Repository URL:</label>
          <input
            id="repoUrl"
            type="text"
            value={settings.repositoryUrl}
            onChange={(e) => setSettings({ ...settings, repositoryUrl: e.target.value })}
            placeholder="https://github.com/username/repo.git"
            className="form-control"
          />
        </div>
      </section>
      
      <section className="settings-section">
        <h2>Environment Mappings</h2>
        <p>Configure which branch maps to each environment</p>
        
        <table className="mappings-table">
          <thead>
            <tr>
              <th>Environment</th>
              <th>Branch</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(settings.environmentMappings).map(([env, branch]) => (
              <tr key={env}>
                <td>{env}</td>
                <td>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => handleUpdateMapping(env, e.target.value)}
                    className="branch-input"
                  />
                </td>
                <td>
                  <button 
                    onClick={() => handleDeleteMapping(env)}
                    className="delete-button"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        <div className="add-mapping-form">
          <h3>Add New Mapping</h3>
          <div className="form-row">
            <input
              type="text"
              value={newEnvName}
              onChange={(e) => setNewEnvName(e.target.value)}
              placeholder="Environment name"
              className="form-control"
            />
            <input
              type="text"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="Branch name"
              className="form-control"
            />
            <button 
              onClick={handleAddMapping}
              disabled={!newEnvName || !newBranchName}
            >
              Add
            </button>
          </div>
        </div>
      </section>
      
      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}
      
      <div className="settings-actions">
        <button onClick={handleSaveSettings} className="primary-button">Save Settings</button>
        <button onClick={onClose}>Back to Dashboard</button>
      </div>
    </div>
  );
};

export default SettingsPage;
