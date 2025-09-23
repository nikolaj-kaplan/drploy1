import React from 'react';
import { Environment } from '../types';

interface EnvironmentRowProps {
  environment: Environment;
  isSelected: boolean;
  onSelect: (env: string) => void;
  onRefresh: (env: string) => void;
  onDeploy: (env: string) => void;
  isOperationRunning: boolean;
  isDeployDisabled?: boolean;
  missingCommitsCount: number;
}

const EnvironmentRow: React.FC<EnvironmentRowProps> = ({
  environment,
  isSelected,
  onSelect,
  onRefresh,
  onDeploy,
  isOperationRunning,
  isDeployDisabled,
  missingCommitsCount
}) => {
  const { name, branch, status, lastDeployedCommit, currentHeadCommit } = environment;
    const getStatusClass = () => {
    return `status-indicator status-indicator-${status}`;
  };
  
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
  <td>{lastDeployedCommit ? lastDeployedCommit.substr(0, 7) : 'Not deployed'}</td>
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
