import React from 'react';
import { Environment, EnvironmentDeploySummary } from '../types';

interface EnvironmentRowProps {
  environment: Environment;
  isSelected: boolean;
  onSelect: (env: string) => void;
  onRefresh: (env: string) => void;
  onDeploy: (env: string) => void;
  isOperationRunning: boolean;
  isDeployDisabled?: boolean;
  missingCommitsCount: number;
  deploySummary: EnvironmentDeploySummary | null;
  isDeploySummaryLoading: boolean;
  currentTimestamp: number;
}

const EnvironmentRow: React.FC<EnvironmentRowProps> = ({
  environment,
  isSelected,
  onSelect,
  onRefresh,
  onDeploy,
  isOperationRunning,
  isDeployDisabled,
  missingCommitsCount,
  deploySummary,
  isDeploySummaryLoading,
  currentTimestamp,
}) => {
  const { name, branch, status, lastDeployedCommit, currentHeadCommit } = environment;
  const latestRun = deploySummary?.latestRun ?? null;
  const isLoadingDeployState = isDeploySummaryLoading && !latestRun;

  const getStatusClass = () => {
    return `status-indicator status-indicator-${status}`;
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds == null || Number.isNaN(seconds)) {
      return 'Unknown';
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }

    return `${remainingSeconds}s`;
  };

  const formatDeployTime = (value: string | null) => {
    if (!value) {
      return 'No deploy yet';
    }

    const date = new Date(value);
    const now = new Date(currentTimestamp);
    const isSameDay = date.toDateString() === now.toDateString();

    if (isSameDay) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    return date.toLocaleString([], {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getElapsedSeconds = () => {
    if (!latestRun) {
      return null;
    }

    if (!latestRun.isActive) {
      return latestRun.durationSeconds;
    }

    const startTimestamp = Date.parse(latestRun.startedAt || latestRun.createdAt);
    if (Number.isNaN(startTimestamp)) {
      return latestRun.durationSeconds;
    }

    return Math.max(0, Math.round((currentTimestamp - startTimestamp) / 1000));
  };

  const getDeployTone = () => {
    if (isLoadingDeployState) {
      return 'neutral';
    }

    if (!latestRun) {
      return 'neutral';
    }

    if (latestRun.isActive) {
      return 'running';
    }

    if (latestRun.conclusion === 'success') {
      return 'success';
    }

    if (latestRun.conclusion === 'failure' || latestRun.conclusion === 'cancelled' || latestRun.conclusion === 'timed_out') {
      return 'failure';
    }

    return 'neutral';
  };

  const getDeployLabel = () => {
    if (isLoadingDeployState) {
      return 'Loading';
    }

    if (!latestRun) {
      return 'No deploy';
    }

    if (latestRun.isActive) {
      return latestRun.status === 'queued' ? 'Queued' : 'Running';
    }

    if (!latestRun.conclusion) {
      return 'Completed';
    }

    return latestRun.conclusion.replace(/_/g, ' ');
  };

  const elapsedSeconds = getElapsedSeconds();
  const canEstimateProgress = Boolean(
    latestRun?.isActive &&
    deploySummary?.estimatedDurationSeconds &&
    deploySummary.successfulSampleSize >= 3 &&
    elapsedSeconds != null
  );
  const progressPercent = canEstimateProgress
    ? Math.min(95, Math.max(8, Math.round((elapsedSeconds! / (deploySummary!.estimatedDurationSeconds as number)) * 100)))
    : null;
  const deployMetaText = isLoadingDeployState
    ? 'Loading latest deploy...'
    : !latestRun
    ? 'No deploy yet'
    : latestRun.isActive
      ? `${formatDuration(elapsedSeconds)} so far`
      : `${getDeployLabel()} ${formatDeployTime(latestRun.completedAt || latestRun.updatedAt)}`;
  const deployTitle = isLoadingDeployState
    ? `Loading latest deploy history for ${name}`
    : !latestRun
    ? `No deploy history for ${name}`
    : [
        `Latest deploy: ${getDeployLabel()}`,
        `Started: ${new Date(latestRun.startedAt || latestRun.createdAt).toLocaleString()}`,
        latestRun.completedAt ? `Completed: ${new Date(latestRun.completedAt).toLocaleString()}` : `Updated: ${new Date(latestRun.updatedAt).toLocaleString()}`,
        `Elapsed: ${formatDuration(elapsedSeconds)}`,
        deploySummary?.estimatedDurationSeconds && deploySummary.successfulSampleSize >= 3
          ? `Estimated duration: ${formatDuration(deploySummary.estimatedDurationSeconds)} from ${deploySummary.successfulSampleSize} successful deploys`
          : 'Estimated duration: not enough history yet',
        `Run #: ${latestRun.runNumber || 'Pending'}`,
        latestRun.htmlUrl ? `GitHub: ${latestRun.htmlUrl}` : '',
      ].filter(Boolean).join('\n');
  
  const getStatusText = () => {
    switch (status) {
      case 'ahead-of-branch':
        return 'ahead of branch';
      case 'pending-commits':
        return 'pending commits';
      case 'up-to-date':
        return 'up to date';
      case 'loading':
        return 'loading';
      case 'error':
        return 'error';
      default:
        return status;
    }
  };

  return (
  <tr className={(isSelected ? 'selected-environment-row ' : '') + 'pointer-row'} onClick={() => onSelect(name)}>
      <td>{name}</td>
      <td>{branch}</td>
      <td>
        <div className={getStatusClass()}></div>
        {getStatusText()}
      </td>
  <td>{missingCommitsCount}</td>
      <td title={deployTitle}>
        <div className="deploy-status-cell">
          <div className="deploy-status-main">
            <span className={`deploy-status-badge deploy-status-badge-${getDeployTone()}`}>
              {(latestRun?.isActive || isLoadingDeployState) && <span className="deploy-spinner" aria-hidden="true"></span>}
              {getDeployLabel()}
            </span>
            <span className="deploy-status-meta">{deployMetaText}</span>
          </div>
          {canEstimateProgress && progressPercent !== null && (
            <div className="deploy-progress-track" aria-hidden="true">
              <div className="deploy-progress-fill" style={{ width: `${progressPercent}%` }}></div>
            </div>
          )}
        </div>
      </td>
      <td>{currentHeadCommit ? currentHeadCommit.substr(0, 7) : 'Unknown'}</td>
      <td className="actions" onClick={e => e.stopPropagation()}>
        <button 
          onClick={() => onRefresh(name)}
          disabled={isOperationRunning}
        >
          Refresh
        </button>
        <button 
          onClick={() => onDeploy(name)}
          disabled={isOperationRunning || status === 'up-to-date' || status === 'ahead-of-branch' || status === 'loading' || isDeployDisabled}
          className={status === 'pending-commits' ? 'primary-button' : ''}
          title={isDeployDisabled ? 'Deploy disabled for this environment' : undefined}
        >
          Deploy
        </button>
      </td>
    </tr>
  );
};

export default EnvironmentRow;
