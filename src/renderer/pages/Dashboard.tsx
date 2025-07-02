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
  const [repositoryUrl, setRepositoryUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [logOutput, setLogOutput] = useState<string>('');
  const [isLoadingCommits, setIsLoadingCommits] = useState(false);
  const [isOperationRunning, setIsOperationRunning] = useState(false);
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
          // Store repository URL
          setRepositoryUrl(settings.repositoryUrl || '');
          
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
    if (isOperationRunning) return;
    
    setIsOperationRunning(true);
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
    } finally {
      setIsOperationRunning(false);
    }
  };

  const handleCheckAllStatus = async (initialEnvironments?: Environment[]) => {
    if (isOperationRunning) return;
    
    setIsOperationRunning(true);
    // If initialEnvironments is provided, use it, otherwise use the current state
    const envsToCheck = initialEnvironments || environments;
    
    // Set all environments to loading
    setEnvironments(prevEnvs => 
      prevEnvs.map(env => ({ ...env, status: 'loading' as 'loading' }))
    );
    
    LogService.log('Checking status for all environments...');
    
    try {
      // Use the provided environments or current state
      if (envsToCheck.length === 0) {
        LogService.log('No environments found to check.');
        return;
      }
      
      for (const env of envsToCheck) {
        // Don't use the individual handleCheckStatus to avoid nested operation blocking
        const result = await GitService.getEnvironmentStatus(env.name);
        
        if (result.success) {
          const envData = JSON.parse(result.output) as Environment;
          
          setEnvironments(prevEnvs => 
            prevEnvs.map(envItem => 
              envItem.name === env.name ? envData : envItem
            )
          );
          
          LogService.log(`Status for ${env.name}: ${envData.status}`);
        } else {
          setEnvironments(prevEnvs => 
            prevEnvs.map(envItem => 
              envItem.name === env.name ? { ...envItem, status: 'error' as 'error', error: result.error } : envItem
            )
          );
          
          LogService.log(`Error checking ${env.name} status: ${result.error}`, true);
        }
      }
      
      LogService.log('Completed checking status for all environments.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogService.log(`Error during bulk status check: ${errorMessage}`, true);
    } finally {
      setIsOperationRunning(false);
    }
  };
  
  const handleViewDetails = async (envName: string) => {
    if (isOperationRunning) return;
    
    setIsOperationRunning(true);
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
      setIsOperationRunning(false);
    }
  };

  const handleDeploy = async (envName: string) => {
    if (isOperationRunning) return;
    
    setIsOperationRunning(true);
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
        
        // Refresh status after deployment - call GitService directly to avoid nested operation blocking
        const statusResult = await GitService.getEnvironmentStatus(envName);
        if (statusResult.success) {
          const envData = JSON.parse(statusResult.output) as Environment;
          setEnvironments(prevEnvs => 
            prevEnvs.map(env => 
              env.name === envName ? envData : env
            )
          );
        }
        
        // If we were showing commits for this environment, refresh them
        if (selectedEnvironment === envName) {
          try {
            const commits = await GitService.getCommitsBetweenTagAndHead(envName);
            setCommits(commits);
          } catch (error) {
            LogService.log(`Error refreshing commits: ${error}`, true);
          }
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
    } finally {
      setIsOperationRunning(false);
    }
  };
  
  const handleDeployAllOutdated = async () => {
    if (isOperationRunning) return;
    
    setIsOperationRunning(true);
    LogService.log('Deploying to all outdated environments...');
    
    try {
      const outdatedEnvs = environments.filter(env => env.status === 'pending-commits');
      
      if (outdatedEnvs.length === 0) {
        LogService.log('No outdated environments found.');
        return;
      }
      
      for (const env of outdatedEnvs) {
        // Set environment to loading
        setEnvironments(prevEnvs => 
          prevEnvs.map(envItem => 
            envItem.name === env.name ? { ...envItem, status: 'loading' as 'loading' } : envItem
          )
        );
        
        LogService.log(`Deploying to ${env.name} environment...`);
        
        const result = await GitService.deployToEnvironment(env.name);
        
        if (result.success) {
          LogService.log(`Successfully deployed to ${env.name}.`);
          
          // Refresh status after deployment
          const statusResult = await GitService.getEnvironmentStatus(env.name);
          if (statusResult.success) {
            const envData = JSON.parse(statusResult.output) as Environment;
            setEnvironments(prevEnvs => 
              prevEnvs.map(envItem => 
                envItem.name === env.name ? envData : envItem
              )
            );
          }
        } else {
          setEnvironments(prevEnvs => 
            prevEnvs.map(envItem => 
              envItem.name === env.name ? { ...envItem, status: 'error' as 'error', error: result.error } : envItem
            )
          );
          
          LogService.log(`Error deploying to ${env.name}: ${result.error}`, true);
        }
      }
      
      LogService.log('Completed deploying to all outdated environments.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogService.log(`Error during bulk deployment: ${errorMessage}`, true);
    } finally {
      setIsOperationRunning(false);
    }
  };
  
  const handleClearLog = () => {
    setLogOutput('');
    LogService.log('Log cleared');
  };
  
  if (isLoading) {
    return <div className="loading">Loading environments...</div>;
  }
    return (
    <div className="dashboard">
      {isOperationRunning && (
        <div className="operation-indicator">
          <span className="operation-spinner"></span>
          Operation in progress... Please wait.
        </div>
      )}
      
      <div className="action-buttons">
        <button 
          onClick={() => handleCheckAllStatus()}
          disabled={isOperationRunning}
        >
          Check All Status
        </button>
        <button 
          onClick={handleDeployAllOutdated}
          disabled={isOperationRunning || !environments.some(env => env.status === 'pending-commits')}
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
                isOperationRunning={isOperationRunning}
              />
            ))}
          </tbody>
        </table>
      </div>
      
      {selectedEnvironment && (
        <div className="commit-details">
          <h2>Commits for {selectedEnvironment}</h2>
          <CommitList commits={commits} loading={isLoadingCommits} repositoryUrl={repositoryUrl} />
        </div>
      )}
        <div className="log-panel">
        <div className="log-header">
          <h3>Log Output</h3>
          <button onClick={handleClearLog}>Clear Log</button>
        </div>
        <pre ref={logPanelRef}>{logOutput}</pre>
      </div>
    </div>
  );
};

export default Dashboard;
