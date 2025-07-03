import React from 'react';
import { Commit } from '../types';

interface CommitListProps {
  commits: Commit[];
  loading: boolean;
  repositoryUrl?: string;
  recentCommitDays?: number;
}

const CommitList: React.FC<CommitListProps> = ({ commits, loading, repositoryUrl, recentCommitDays = 7 }) => {
  // Function to parse PR number from merge commit message
  const parsePRFromMessage = (message: string): number | null => {
    const prMatch = message.match(/Merge pull request #(\d+)/);
    return prMatch ? parseInt(prMatch[1], 10) : null;
  };

  // Function to handle opening external URL via Electron shell
  const handleOpenExternal = (url: string) => {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('open-external', url);
  };

  // Function to render commit message with PR link if applicable
  const renderCommitMessage = (commit: Commit): React.ReactNode => {
    const prNumber = parsePRFromMessage(commit.message);
    
    if (prNumber && repositoryUrl) {
      // Extract the GitHub repo path from the URL
      const repoMatch = repositoryUrl.match(/github\.com[\/:](.+?)(?:\.git)?$/);
      const repoPath = repoMatch ? repoMatch[1] : null;
      
      if (repoPath) {
        const prUrl = `https://github.com/${repoPath}/pull/${prNumber}`;
        
        return (
          <span>
            <a 
              href="#"
              onClick={(e) => {
                e.preventDefault();
                handleOpenExternal(prUrl);
              }}
              className="pr-link"
              title={`Open PR #${prNumber} on GitHub`}
            >
              {commit.message}
            </a>
          </span>
        );
      }
    }
    
    return <span>{commit.message}</span>;
  };

  if (loading) {
    return (
      <div className="commit-list-loading">
        Loading commits...
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="commit-list-empty">
        No commits found in the last {recentCommitDays} days.
      </div>
    );
  }

  return (
    <div className="commit-list">
      <h3>
        {commits.some(c => c.deployed) ? (
          <>
            <span className="deployed-indicator">✓</span>
            Recent Deployed Commits (Last {recentCommitDays} Days)
          </>
        ) : (
          'Commits to Deploy'
        )}
      </h3>
      <table className="commit-table">
        <thead>
          <tr>
            <th>Hash</th>
            <th>Message</th>
            <th>Author</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {commits.map((commit) => (
            <tr key={commit.hash} className={commit.deployed ? 'commit-deployed' : 'commit-pending'}>
              <td>{commit.hash.substring(0, 7)}</td>
              <td className="commit-message">{renderCommitMessage(commit)}</td>
              <td>{commit.author}</td>
              <td>{new Date(commit.timestamp).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CommitList;
