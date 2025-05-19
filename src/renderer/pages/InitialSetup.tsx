import React, { useState } from 'react';
import { GitService } from '../services/GitService';

interface InitialSetupProps {
  onSetupComplete: () => void;
}

const InitialSetup: React.FC<InitialSetupProps> = ({ onSetupComplete }) => {
  const [token, setToken] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token || !repoUrl) {
      setError('Please enter both GitHub token and repository URL');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await GitService.initializeRepository(token, repoUrl);
      
      if (result.success) {
        onSetupComplete();
      } else {
        setError(result.error || 'Failed to initialize repository');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="initial-setup">
      <h1>Git Deployment Manager</h1>
      <h2>Initial Setup</h2>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="token">GitHub Personal Access Token:</label>
          <input
            id="token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={isLoading}
            placeholder="Enter your GitHub PAT"
            className="form-control"
          />
          <small>Token needs repo and read:org permissions</small>
        </div>
        
        <div className="form-group">
          <label htmlFor="repoUrl">Repository URL:</label>
          <input
            id="repoUrl"
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            disabled={isLoading}
            placeholder="https://github.com/username/repo.git"
            className="form-control"
          />
        </div>

        {error && <div className="error-message">{error}</div>}
        
        <button type="submit" disabled={isLoading} className="primary-button">
          {isLoading ? 'Connecting...' : 'Connect Repository'}
        </button>
      </form>
    </div>
  );
};

export default InitialSetup;
