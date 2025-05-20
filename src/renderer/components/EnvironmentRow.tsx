import React from 'react';
import { Environment } from '../types';

interface EnvironmentRowProps {
  environment: Environment;
  onStatusCheck: (env: string) => void;
  onViewDetails: (env: string) => void;
  onDeploy: (env: string) => void;
}

const EnvironmentRow: React.FC<EnvironmentRowProps> = ({
  environment,
  onStatusCheck,
  onViewDetails,
  onDeploy
}) => {
  const { name, branch, status, lastDeployedCommit, currentHeadCommit } = environment;
    const getStatusClass = () => {
    return `status-indicator status-indicator-${status}`;
  };
  
  return (
    <tr>
      <td>{name}</td>
      <td>{branch}</td>
      <td>
        <div className={getStatusClass()}></div>
        {status}
      </td>
      <td>{lastDeployedCommit ? lastDeployedCommit.substr(0, 7) : 'Not deployed'}</td>
      <td>{currentHeadCommit ? currentHeadCommit.substr(0, 7) : 'Unknown'}</td>
      <td className="actions">
        <button onClick={() => onStatusCheck(name)}>Check</button>
        <button onClick={() => onViewDetails(name)}>Details</button>
        <button 
          onClick={() => onDeploy(name)}
          disabled={status === 'up-to-date' || status === 'loading'}
          className={status === 'pending-commits' ? 'primary-button' : ''}
        >
          Deploy
        </button>
      </td>
    </tr>
  );
};

export default EnvironmentRow;
