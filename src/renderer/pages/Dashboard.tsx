import React, { useState, useEffect } from 'react';
import { Environment, Commit } from '../types';
import { GitService } from '../services/GitService';
import { SettingsService } from '../services/SettingsService';
import EnvironmentRow from '../components/EnvironmentRow';
import CommitList from '../components/CommitList';

const Dashboard: React.FC = () => {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedEnvironment, setSelectedEnvironment] = useState<string | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [logOutput, setLogOutput] = useState<string>('');
  const [isLoadingCommits, setIsLoadingCommits] = useState(false);
  
  // Load settings and environments on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await SettingsService.loadSettings();
        if (settings && settings.environmentMappings) {
          // Create initial environment objects
          const initialEnvironments = Object.keys(settings.environmentMappings).map(envName => ({
            name: envName,
            branch: settings.environmentMappings[envName],
            status: 'loading',
            lastDeployedCommit: null,
            currentHeadCommit: null
          }));
          
          setEnvironments(initialEnvironments);
          setIsLoading(false);
          
          // Check status for all environments
          handleCheckAllStatus();
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
        setIsLoading(false);
      }
    };
    
    loadSettings();
  }, []);
  
  const handleCheckStatus = async (envName: string) => {
    // Update environment status to loading
    setEnvironments(prevEnvs => 
      prevEnvs.map(env => 
        env.name === envName ? { ...env, status: 'loading' } : env
      )
    );
    
    addToLog(`Checking status for ${envName} environment...`);
    
    try {
      const result = await GitService.getEnvironmentStatus(envName);
      
      if (result.success) {
        const envData = JSON.parse(result.output) as Environment;
        
        setEnvironments(prevEnvs => 
          prevEnvs.map(env => 
            env.name === envName ? envData : env
          )
        );
        
        addToLog(`Status for ${envName}: ${envData.status}`);
      } else {
        setEnvironments(prevEnvs => 
          prevEnvs.map(env => 
            env.name === envName ? { ...env, status: 'error' } : env
          )
        );
        
        addToLog(`Error checking ${envName} status: ${result.error}`);
      }
    } catch (error) {
      console.error(`Error checking status for ${envName}:`, error);
      addToLog(`Error checking ${envName} status: ${error}`);
      
      setEnvironments(prevEnvs => 
        prevEnvs.map(env => 
          env.name === envName ? { ...env, status: 'error' } : env
        )
      );
    }
  };
  
  const handleCheckAllStatus = async () => {
    // Set all environments to loading
    setEnvironments(prevEnvs => 
      prevEnvs.map(env => ({ ...env, status: 'loading' }))
    );
    
    addToLog('Checking status for all environments...');
    
    // Check status for each environment individually
    for (const env of environments) {
      await handleCheckStatus(env.name);
    }
    
    addToLog('Completed checking status for all environments.');
  };
  
  const handleViewDetails = async (envName: string) => {
    setSelectedEnvironment(envName);
    setIsLoadingCommits(true);
    setCommits([]);
    
    addToLog(`Loading commit details for ${envName}...`);
    
    try {
      const commits = await GitService.getCommitsBetweenTagAndHead(envName);
      setCommits(commits);
      addToLog(`Loaded ${commits.length} commits for ${envName}.`);
    } catch (error) {
      console.error(`Error loading commits for ${envName}:`, error);
      addToLog(`Error loading commit details: ${error}`);
    } finally {
      setIsLoadingCommits(false);
    }
  };
  
  const handleDeploy = async (envName: string) => {
    // Update environment status to loading
    setEnvironments(prevEnvs => 
      prevEnvs.map(env => 
        env.name === envName ? { ...env, status: 'loading' } : env
      )
    );
    
    addToLog(`Deploying to ${envName} environment...`);
    
    try {
      const result = await GitService.deployToEnvironment(envName);
      
      if (result.success) {
        addToLog(`Successfully deployed to ${envName}.`);
        
        // Refresh status after deployment
        await handleCheckStatus(envName);
        
        // If we were showing commits for this environment, refresh them
        if (selectedEnvironment === envName) {
          handleViewDetails(envName);
        }
      } else {
        setEnvironments(prevEnvs => 
          prevEnvs.map(env => 
            env.name === envName ? { ...env, status: 'error' } : env
          )
        );
        
        addToLog(`Error deploying to ${envName}: ${result.error}`);
      }
    } catch (error) {
      console.error(`Error deploying to ${envName}:`, error);
      addToLog(`Error deploying to ${envName}: ${error}`);
      
      setEnvironments(prevEnvs => 
        prevEnvs.map(env => 
          env.name === envName ? { ...env, status: 'error' } : env
        )
      );
    }
  };
  
  const handleDeployAllOutdated = async () => {
    addToLog('Deploying to all outdated environments...');
    
    const outdatedEnvs = environments.filter(env => env.status === 'pending-commits');
    
    for (const env of outdatedEnvs) {
      await handleDeploy(env.name);
    }
    
    addToLog('Completed deploying to all outdated environments.');
  };
  
  const addToLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogOutput(prevLog => `${prevLog}\n[${timestamp}] ${message}`);
  };
  
  if (isLoading) {
    return <div className="loading">Loading environments...</div>;
  }
  
  return (
    <div className="dashboard">
      <h1>Git Deployment Manager</h1>
      
      <div className="action-buttons">
        <button onClick={handleCheckAllStatus}>Check All Status</button>
        <button 
          onClick={handleDeployAllOutdated}
          disabled={!environments.some(env => env.status === 'pending-commits')}
          className="primary-button"
        >
          Deploy All Outdated
        </button>
      </div>
      
      <div className="environments-table">
        <table>
          <thead>
            <tr>
              <th>Environment</th>
              <th>Branch</th>
              <th>Status</th>
              <th>Last Deployed</th>
              <th>Current HEAD</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {environments.map(env => (
              <EnvironmentRow
                key={env.name}
                environment={env}
                onStatusCheck={handleCheckStatus}
                onViewDetails={handleViewDetails}
                onDeploy={handleDeploy}
              />
            ))}
          </tbody>
        </table>
      </div>
      
      {selectedEnvironment && (
        <div className="commit-details">
          <h2>Commits for {selectedEnvironment}</h2>
          <CommitList commits={commits} loading={isLoadingCommits} />
        </div>
      )}
      
      <div className="log-panel">
        <h3>Log Output</h3>
        <pre>{logOutput}</pre>
      </div>
    </div>
  );
};

export default Dashboard;
