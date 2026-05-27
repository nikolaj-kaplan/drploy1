import React, { useState, useEffect, useRef } from 'react';
import { Environment, Commit, AppSettings, EnvironmentDeploySummary, EnvironmentInfo } from '../types';
import { GitService } from '../services/GitService';
import { SettingsService } from '../services/SettingsService';
import { LogService } from '../services/LogService';
import EnvironmentRow from '../components/EnvironmentRow';
import CommitList from '../components/CommitList';
import ProductionConfirmModal from '../components/ProductionConfirmModal';

interface DashboardProps {
  refreshTrigger?: number;
}

const Dashboard: React.FC<DashboardProps> = ({ refreshTrigger = 0 }) => {
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
  const [deploySummariesByEnv, setDeploySummariesByEnv] = useState<Record<string, EnvironmentDeploySummary>>({});
  const [isLoadingDeploySummaries, setIsLoadingDeploySummaries] = useState(false);
  const [deploySummariesError, setDeploySummariesError] = useState<string | null>(null);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());
  const [showProductionModal, setShowProductionModal] = useState(false);
  const [pendingDeployEnv, setPendingDeployEnv] = useState<string | null>(null);
  const [pendingBulkDeploy, setPendingBulkDeploy] = useState(false);
  const logUnsubscribe = useRef<(() => void) | null>(null);
  const logPanelRef = useRef<HTMLPreElement>(null);
  const optimisticDeployStartedAtRef = useRef<Record<string, number>>({});
  
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
          if (settings.repositoryUrl) {
            void loadDeploySummaries();
          }
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

  const loadDeploySummaries = async (silent = false) => {
    if (!silent) {
      setIsLoadingDeploySummaries(true);
    }

    try {
      const result = await GitService.getEnvironmentDeploySummaries(40);
      if (result.success) {
        setDeploySummariesByEnv(prevSummaries => {
          const fetchedSummaries = result.summaries.reduce<Record<string, EnvironmentDeploySummary>>((accumulator, summary) => {
            accumulator[summary.environment] = summary;
            return accumulator;
          }, {});

          for (const [envName, optimisticStartedAt] of Object.entries(optimisticDeployStartedAtRef.current)) {
            const previousSummary = prevSummaries[envName];
            const fetchedSummary = fetchedSummaries[envName];
            const fetchedUpdatedAt = fetchedSummary?.latestRun
              ? Date.parse(fetchedSummary.latestRun.updatedAt || fetchedSummary.latestRun.createdAt)
              : Number.NaN;

            if (!Number.isNaN(fetchedUpdatedAt) && fetchedUpdatedAt >= optimisticStartedAt) {
              delete optimisticDeployStartedAtRef.current[envName];
              continue;
            }

            if (previousSummary?.latestRun?.isActive) {
              fetchedSummaries[envName] = previousSummary;
            }
          }

          return fetchedSummaries;
        });
        setDeploySummariesError(null);
      } else {
        setDeploySummariesError(result.error || 'Failed to load deploy summaries.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setDeploySummariesError(errorMessage);
    } finally {
      setIsLoadingDeploySummaries(false);
    }
  };

  const setOptimisticDeploySummary = (envName: string) => {
    const optimisticStartedAt = Date.now();
    const nowIso = new Date(optimisticStartedAt).toISOString();
    optimisticDeployStartedAtRef.current[envName] = optimisticStartedAt;

    setDeploySummariesByEnv(prevSummaries => {
      const existingSummary = prevSummaries[envName];
      return {
        ...prevSummaries,
        [envName]: {
          environment: envName,
          estimatedDurationSeconds: existingSummary?.estimatedDurationSeconds ?? null,
          successfulSampleSize: existingSummary?.successfulSampleSize ?? 0,
          lastSuccessfulAt: existingSummary?.lastSuccessfulAt ?? null,
          latestRun: {
            id: existingSummary?.latestRun?.id ?? Date.now(),
            runNumber: existingSummary?.latestRun?.runNumber ?? 0,
            workflowName: existingSummary?.latestRun?.workflowName || 'Deploy',
            displayTitle: `Deploy to ${envName}`,
            event: 'push',
            status: 'queued',
            conclusion: null,
            htmlUrl: existingSummary?.latestRun?.htmlUrl || '',
            headBranch: envName,
            headSha: null,
            environment: envName,
            createdAt: nowIso,
            startedAt: nowIso,
            updatedAt: nowIso,
            completedAt: null,
            durationSeconds: 0,
            isActive: true,
          },
        },
      };
    });
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
    const previousDeploySummary = deploySummariesByEnv[envName] ?? null;
    setIsOperationRunning(true);
    setEnvironments(prevEnvs => 
      prevEnvs.map(env => 
        env.name === envName ? { ...env, status: 'loading' as 'loading' } : env
      )
    );
    setOptimisticDeploySummary(envName);
    LogService.log(`Deploying to ${envName} environment...`);
    try {
      const result = await GitService.deployToEnvironment(envName);
      if (result.success) {
        LogService.log(`Successfully deployed to ${envName}.`);
        // Refresh status and commits after deployment
        await handleRefreshEnvironment(envName);
        void loadDeploySummaries();
      } else {
        setEnvironments(prevEnvs => 
          prevEnvs.map(env => 
            env.name === envName ? { ...env, status: 'error' as 'error', error: result.error } : env
          )
        );
        setDeploySummariesByEnv(prevSummaries => {
          delete optimisticDeployStartedAtRef.current[envName];
          if (!previousDeploySummary) {
            const nextSummaries = { ...prevSummaries };
            delete nextSummaries[envName];
            return nextSummaries;
          }

          return {
            ...prevSummaries,
            [envName]: previousDeploySummary,
          };
        });
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
      setDeploySummariesByEnv(prevSummaries => {
        delete optimisticDeployStartedAtRef.current[envName];
        if (!previousDeploySummary) {
          const nextSummaries = { ...prevSummaries };
          delete nextSummaries[envName];
          return nextSummaries;
        }

        return {
          ...prevSummaries,
          [envName]: previousDeploySummary,
        };
      });
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

  // Re-fetch mappings and refresh all environments when refreshTrigger changes (e.g. returning from Settings)
  useEffect(() => {
    if (refreshTrigger > 0) {
      handleCheckAllStatus();
    }
  }, [refreshTrigger]);

  useEffect(() => {
    if (isLoading || !repositoryUrl) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadDeploySummaries(true);
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isLoading, repositoryUrl]);

  useEffect(() => {
    const hasActiveDeploy = Object.values(deploySummariesByEnv).some(summary => summary.latestRun?.isActive);
    if (!hasActiveDeploy) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setCurrentTimestamp(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [deploySummariesByEnv]);

  const handleCheckAllStatus = async (initialEnvironments?: Environment[]) => {
    if (isOperationRunning) return;
    setIsOperationRunning(true);

    // When triggered by the user (not initial load), re-fetch the mapping from the
    // central repo first so we pick up changes made by other users.
    let envsToCheck = initialEnvironments || environments;
    if (!initialEnvironments) {
      try {
        LogService.log('Fetching latest environment mappings from central repo...');
        const freshSettings = await SettingsService.loadSettings();
        if (freshSettings?.environmentMappings) {
          const freshEnvs: Environment[] = Object.keys(freshSettings.environmentMappings).map(envName => ({
            name: envName,
            branch: freshSettings.environmentMappings[envName],
            status: 'loading' as 'loading',
            lastDeployedCommit: null,
            currentHeadCommit: null
          }));
          setEnvironments(freshEnvs);
          setDisabledEnvironments(freshSettings.disabledEnvironments || []);
          if (freshSettings.repositoryUrl) setRepositoryUrl(freshSettings.repositoryUrl);
          envsToCheck = freshEnvs;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        LogService.log(`Failed to fetch latest mappings, using cached list: ${errMsg}`, true);
      }
    }

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
        const previousDeploySummary = deploySummariesByEnv[env.name] ?? null;
        // Set environment to loading
        setEnvironments(prevEnvs => 
          prevEnvs.map(envItem => 
            envItem.name === env.name ? { ...envItem, status: 'loading' as 'loading' } : envItem
          )
        );
        setOptimisticDeploySummary(env.name);
        
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
          void loadDeploySummaries(true);
        } else {
          setEnvironments(prevEnvs => 
            prevEnvs.map(envItem => 
              envItem.name === env.name ? { ...envItem, status: 'error' as 'error', error: result.error } : envItem
            )
          );
          setDeploySummariesByEnv(prevSummaries => {
            delete optimisticDeployStartedAtRef.current[env.name];
            if (!previousDeploySummary) {
              const nextSummaries = { ...prevSummaries };
              delete nextSummaries[env.name];
              return nextSummaries;
            }

            return {
              ...prevSummaries,
              [env.name]: previousDeploySummary,
            };
          });
          
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

      {deploySummariesError && (
        <div className="error-message deploy-status-error">
          {deploySummariesError}
        </div>
      )}
      
      <div className="environments-table">
        <table>
          <thead>
            <tr>
              <th>Environment</th>
              <th>Branch</th>
              <th>Status</th>
              <th>Missing Commits</th>
              <th>Deploy</th>
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
                deploySummary={deploySummariesByEnv[env.name] ?? null}
                isDeploySummaryLoading={isLoadingDeploySummaries && !deploySummariesByEnv[env.name]}
                currentTimestamp={currentTimestamp}
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
