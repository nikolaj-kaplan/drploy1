import React, { useState, useEffect, useRef } from 'react';
import { Environment, Commit, AppSettings, EnvironmentInfo } from '../types';
import { GitService } from '../services/GitService';
import { SettingsService } from '../services/SettingsService';
import { LogService } from '../services/LogService';
import EnvironmentRow from '../components/EnvironmentRow';
import CommitList from '../components/CommitList';
import ProductionConfirmModal from '../components/ProductionConfirmModal';

const Dashboard: React.FC = () => {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [disabledEnvironments, setDisabledEnvironments] = useState<string[]>([]);
  const [selectedEnvironment, setSelectedEnvironment] = useState<string | null>(null);
  // Store commits per environment for instant switching
  const [commitsByEnv, setCommitsByEnv] = useState<Record<string, Commit[]>>({});
  const [commits, setCommits] = useState<Commit[]>([]); // for currently selected env
  const [repositoryUrl, setRepositoryUrl] = useState<string>('');
  // Remove recentCommitDays, not used anymore
  // For deployed commit pagination
  const [deployedCommitsShown, setDeployedCommitsShown] = useState(10);
  const [hasMoreDeployedCommits, setHasMoreDeployedCommits] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [logOutput, setLogOutput] = useState<string>('');
  const [isLoadingCommits, setIsLoadingCommits] = useState(false);
  const [isOperationRunning, setIsOperationRunning] = useState(false);
  const [showProductionModal, setShowProductionModal] = useState(false);
  const [pendingDeployEnv, setPendingDeployEnv] = useState<string | null>(null);
  const [pendingBulkDeploy, setPendingBulkDeploy] = useState(false);
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
        const settings: AppSettings | null = await SettingsService.loadSettings();
        if (settings && settings.environmentMappings) {
          setRepositoryUrl(settings.repositoryUrl || '');
          // Removed recentCommitDays logic
          setDisabledEnvironments(settings.disabledEnvironments || []);
          const initialEnvironments: Environment[] = Object.keys(settings.environmentMappings).map(envName => ({
            name: envName,
            branch: settings.environmentMappings[envName],
            status: 'loading' as 'loading',
            lastDeployedCommit: null,
            currentHeadCommit: null
          }));
          setEnvironments(initialEnvironments);
          setIsLoading(false);
          // Always fetch status and commits for the first environment (or selected)
          if (initialEnvironments.length > 0) {
            const firstEnv = initialEnvironments[0].name;
            setSelectedEnvironment(firstEnv);
            await handleRefreshEnvironment(firstEnv);
          }
          // Also check all statuses in the background
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

  // Helper function to check if environment is production
  const isProductionEnvironment = (envName: string): boolean => {
    const normalized = envName.toLowerCase();
    return normalized === 'prod' || normalized === 'production';
  };

  // Select environment and show cached commits (or empty if not loaded yet)
  const handleSelectEnvironment = (envName: string) => {
    setSelectedEnvironment(envName);
    setCommits(commitsByEnv[envName] || []);
    setDeployedCommitsShown(10);
    setHasMoreDeployedCommits(true);
  };

  // Fetch all info for a single environment (status, SHAs, commits)
  const handleRefreshEnvironment = async (envName: string) => {
    if (isOperationRunning) return;
    setIsOperationRunning(true);
    setEnvironments(prevEnvs => prevEnvs.map(env => env.name === envName ? { ...env, status: 'loading' as 'loading' } : env));
    setIsLoadingCommits(true);
    setDeployedCommitsShown(10);
    setHasMoreDeployedCommits(true);
    LogService.log(`Refreshing all info for ${envName}...`);
    try {
      const info: EnvironmentInfo = await GitService.getEnvironmentInfo(envName);
      setEnvironments(prevEnvs => prevEnvs.map(env => env.name === envName ? {
        name: info.name,
        branch: info.branch,
        status: info.status,
        lastDeployedCommit: info.lastDeployedCommit,
        currentHeadCommit: info.currentHeadCommit
      } : env));
      setCommitsByEnv(prev => ({ ...prev, [envName]: info.commits }));
      // Always update commits for selected environment after refresh
      if (selectedEnvironment === envName || !selectedEnvironment) setCommits(info.commits);
      // Always allow loading more after refresh
      setHasMoreDeployedCommits(true);
      LogService.log(`Loaded info for ${envName}. Status: ${info.status}, Commits: ${info.commits.length}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogService.log(`Error loading info for ${envName}: ${errorMessage}`, true);
    } finally {
      setIsLoadingCommits(false);
      setIsOperationRunning(false);
    }
  };
  const performDeployment = async (envName: string) => {
    setIsOperationRunning(true);
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
        // Refresh status and commits after deployment
        await handleRefreshEnvironment(envName);
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
    const envsToCheck = initialEnvironments || environments;
    setEnvironments(prevEnvs => prevEnvs.map(env => ({ ...env, status: 'loading' as 'loading' })));
    LogService.log('Checking all info for all environments...');
    try {
      if (envsToCheck.length === 0) {
        LogService.log('No environments found to check.');
        return;
      }
      for (const env of envsToCheck) {
        try {
          const info: EnvironmentInfo = await GitService.getEnvironmentInfo(env.name);
          setEnvironments(prevEnvs => prevEnvs.map(e => e.name === env.name ? {
            name: info.name,
            branch: info.branch,
            status: info.status,
            lastDeployedCommit: info.lastDeployedCommit,
            currentHeadCommit: info.currentHeadCommit
          } : e));
          setCommitsByEnv(prev => ({ ...prev, [env.name]: info.commits }));
          // Refresh commit list for selected environment after each env update
          if (selectedEnvironment === env.name) {
            setCommits(info.commits);
          }
          LogService.log(`Loaded info for ${env.name}. Status: ${info.status}, Commits: ${info.commits.length}`);
        } catch (e) {
          setEnvironments(prevEnvs => prevEnvs.map(e => e.name === env.name ? env : e));
          setCommitsByEnv(prev => ({ ...prev, [env.name]: [] }));
        }
      }
      LogService.log('Completed checking all info for all environments.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LogService.log(`Error during bulk info check: ${errorMessage}`, true);
    } finally {
      setIsOperationRunning(false);
    }
  };
  
  // Remove full reload logic from Dashboard when returning from SettingsPage

  // Remove handleViewDetails (no longer needed)

  const handleDeploy = async (envName: string) => {
    if (isOperationRunning) return;
    
    // Check if this is a production environment
    if (isProductionEnvironment(envName)) {
      // Show confirmation modal for production deployments
      setPendingDeployEnv(envName);
      setShowProductionModal(true);
      return;
    }
    
    // For non-production environments, deploy directly
    await performDeployment(envName);
  };
  
  const handleDeployAllOutdated = async () => {
    if (isOperationRunning) return;
    
    const outdatedEnvs = environments.filter(env => env.status === 'pending-commits');
    
    if (outdatedEnvs.length === 0) {
      LogService.log('No outdated environments found.');
      return;
    }
    
    // Check if any of the outdated environments are production environments
    const hasProductionEnv = outdatedEnvs.some(env => isProductionEnvironment(env.name));
    
    if (hasProductionEnv) {
      // Show confirmation modal for bulk deployment including production
      const productionEnvNames = outdatedEnvs
        .filter(env => isProductionEnvironment(env.name))
        .map(env => env.name)
        .join(', ');
      setPendingDeployEnv(`Production environments: ${productionEnvNames}`);
      setPendingBulkDeploy(true);
      setShowProductionModal(true);
      return;
    }
    
    // For bulk deployment without production environments, deploy directly
    await performBulkDeployment(outdatedEnvs);
  };

  const performBulkDeployment = async (outdatedEnvs: Environment[]) => {
    setIsOperationRunning(true);
    LogService.log('Deploying to all outdated environments...');
    
    try {
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

  const handleProductionConfirm = async () => {
    setShowProductionModal(false);
    
    if (pendingBulkDeploy) {
      // Handle bulk deployment with production environments
      const outdatedEnvs = environments.filter(env => env.status === 'pending-commits');
      await performBulkDeployment(outdatedEnvs);
      setPendingBulkDeploy(false);
    } else if (pendingDeployEnv && !pendingDeployEnv.includes(':')) {
      // Handle single environment deployment
      await performDeployment(pendingDeployEnv);
    }
    
    setPendingDeployEnv(null);
  };

  const handleProductionCancel = () => {
    setShowProductionModal(false);
    setPendingDeployEnv(null);
    setPendingBulkDeploy(false);
    LogService.log('Production deployment cancelled by user.');
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
      </div>
      
      <div className="environments-table">
        <table>
          <thead>
            <tr>
              <th>Environment</th>
              <th>Branch</th>
              <th>Status</th>
              <th>Missing Commits</th>
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
                isSelected={selectedEnvironment === env.name}
                onSelect={handleSelectEnvironment}
                onRefresh={handleRefreshEnvironment}
                onDeploy={handleDeploy}
                isOperationRunning={isOperationRunning}
                isDeployDisabled={disabledEnvironments.includes(env.name)}
                missingCommitsCount={(commitsByEnv[env.name] || []).length}
              />
            ))}
          </tbody>
        </table>
      </div>

      {selectedEnvironment && (
        <div className="commit-details">
          <h2>Commits for {selectedEnvironment}</h2>
          <CommitList 
            commits={commits}
            loading={isLoadingCommits}
            repositoryUrl={repositoryUrl}
          />
          {/* Load more button hidden for now */}
        </div>
      )}
        <div className="log-panel">
        <div className="log-header">
          <h3>Log Output</h3>
          <button onClick={handleClearLog}>Clear Log</button>
        </div>
        <pre ref={logPanelRef}>{logOutput}</pre>
      </div>
      
      <ProductionConfirmModal
        environmentName={pendingDeployEnv || ''}
        isVisible={showProductionModal}
        onConfirm={handleProductionConfirm}
        onCancel={handleProductionCancel}
      />
    </div>
  );
};

export default Dashboard;
