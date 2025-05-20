import React, { useState, useEffect, useRef } from 'react';
import { Environment, Commit } from '../types';
import { GitService } from '../services/GitService';
import { SettingsService } from '../services/SettingsService';
import { LogService } from '../services/LogService';
import EnvironmentRow from '../components/EnvironmentRow';
import CommitList from '../components/CommitList';

const Dashboard: React.FC = () => {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedEnvironment, setSelectedEnvironment] = useState<string | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [logOutput, setLogOutput] = useState<string>('');
  const [isLoadingCommits, setIsLoadingCommits] = useState(false);
  const logUnsubscribe = useRef<(() => void) | null>(null);
  const logPanelRef = useRef<HTMLPreElement>(null);
  
  // Scroll log panel to bottom whenever logOutput changes
  useEffect(() => {
    if (logPanelRef.current) {
      logPanelRef.current.scrollTop = logPanelRef.current.scrollHeight;
    }
  }, [logOutput]);
  
  // Load settings and environments on mount and subscribe to logs
  useEffect(() => {
    // Subscribe to log messages
    logUnsubscribe.current = LogService.addLogListener((message) => {
      setLogOutput(prevLog => `${prevLog}\n${message}`);
    });

    const loadSettings = async () => {
      try {
        LogService.log('Loading application settings');
        const settings = await SettingsService.loadSettings();
        if (settings && settings.environmentMappings) {
          // Create initial environment objects with correctly typed status
          const initialEnvironments: Environment[] = Object.keys(settings.environmentMappings).map(envName => ({
            name: envName,
            branch: settings.environmentMappings[envName],
            status: 'loading' as 'loading', // Explicit type assertion for the union type
            lastDeployedCommit: null,
            currentHeadCommit: null
          }));
          
          setEnvironments(initialEnvironments);
          setIsLoading(false);
          
          // Check status for all environments - pass initialEnvironments directly
          handleCheckAllStatus(initialEnvironments);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        LogService.log(`Failed to load settings: ${errorMessage}`, true);
        setIsLoading(false);
      }
    };
    
    loadSettings();

    // Cleanup subscription when component unmounts
    return () => {
      if (logUnsubscribe.current) {
        logUnsubscribe.current();
      }
    };
  }, []);
    const handleCheckStatus = async (envName: string) => {
    // Update environment status to loading
    setEnvironments(prevEnvs => 
      prevEnvs.map(env => 
        env.name === envName ? { ...env, status: 'loading' as 'loading' } : env
      )
    );
    
    LogService.log(`Checking status for ${envName} environment...`);
    
    try {
      const result = await GitService.getEnvironmentStatus(envName);
      
      if (result.success) {
        const envData = JSON.parse(result.output) as Environment;
        
        setEnvironments(prevEnvs => 
          prevEnvs.map(env => 
            env.name === envName ? envData : env
          )
        );
        
        LogService.log(`Status for ${envName}: ${envData.status}`);
      } else {
        setEnvironments(prevEnvs => 
          prevEnvs.map(env => 
            env.name === envName ? { ...env, status: 'error' as 'error', error: result.error } : env
          )
        );
        
        LogService.log(`Error checking ${envName} status: ${result.error}`, true);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogService.log(`Error checking status for ${envName}: ${errorMessage}`, true);
      
      setEnvironments(prevEnvs => 
        prevEnvs.map(env => 
          env.name === envName ? { ...env, status: 'error' as 'error', error: errorMessage } : env
        )
      );
    }
  };

  const handleCheckAllStatus = async (initialEnvironments?: Environment[]) => {
    // If initialEnvironments is provided, use it, otherwise use the current state
    const envsToCheck = initialEnvironments || environments;
    
    // Set all environments to loading
    setEnvironments(prevEnvs => 
      prevEnvs.map(env => ({ ...env, status: 'loading' as 'loading' }))
    );
    
    LogService.log('Checking status for all environments...');
    
    // Use the provided environments or current state
    if (envsToCheck.length === 0) {
      LogService.log('No environments found to check.');
      return;
    }
    
    for (const env of envsToCheck) {
      await handleCheckStatus(env.name);
    }
    
    LogService.log('Completed checking status for all environments.');
  };
  
  const handleViewDetails = async (envName: string) => {
    setSelectedEnvironment(envName);
    setIsLoadingCommits(true);
    setCommits([]);
    
    LogService.log(`Loading commit details for ${envName}...`);
    
    try {
      const commits = await GitService.getCommitsBetweenTagAndHead(envName);
      setCommits(commits);
      LogService.log(`Loaded ${commits.length} commits for ${envName}.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogService.log(`Error loading commits for ${envName}: ${errorMessage}`, true);
    } finally {
      setIsLoadingCommits(false);
    }
  };

  const handleDeploy = async (envName: string) => {
    // Update environment status to loading
    setEnvironments(prevEnvs => 
      prevEnvs.map(env => 
        env.name === envName ? { ...env, status: 'loading' as 'loading' } : env
      )
    );
    
    LogService.log(`Deploying to ${envName} environment...`);
    
    try {
      const result = await GitService.deployToEnvironment(envName);
      
      if (result.success) {
        LogService.log(`Successfully deployed to ${envName}.`);
        
        // Refresh status after deployment
        await handleCheckStatus(envName);
        
        // If we were showing commits for this environment, refresh them
        if (selectedEnvironment === envName) {
          handleViewDetails(envName);
        }
      } else {
        setEnvironments(prevEnvs => 
          prevEnvs.map(env => 
            env.name === envName ? { ...env, status: 'error' as 'error', error: result.error } : env
          )
        );
        
        LogService.log(`Error deploying to ${envName}: ${result.error}`, true);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogService.log(`Error deploying to ${envName}: ${errorMessage}`, true);
      
      setEnvironments(prevEnvs => 
        prevEnvs.map(env => 
          env.name === envName ? { ...env, status: 'error' as 'error', error: errorMessage } : env
        )
      );
    }
  };
  
  const handleDeployAllOutdated = async () => {
    LogService.log('Deploying to all outdated environments...');
    
    const outdatedEnvs = environments.filter(env => env.status === 'pending-commits');
    
    if (outdatedEnvs.length === 0) {
      LogService.log('No outdated environments found.');
      return;
    }
    
    for (const env of outdatedEnvs) {
      await handleDeploy(env.name);
    }
    
    LogService.log('Completed deploying to all outdated environments.');
  };
  
  if (isLoading) {
    return <div className="loading">Loading environments...</div>;
  }
    return (
    <div className="dashboard">
      <div className="action-buttons">
        <button onClick={() => handleCheckAllStatus()}>Check All Status</button>
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
        <pre ref={logPanelRef}>{logOutput}</pre>
      </div>
    </div>
  );
};

export default Dashboard;
