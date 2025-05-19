import React from 'react';
import { Commit } from '../types';

interface CommitListProps {
  commits: Commit[];
  loading: boolean;
}

const CommitList: React.FC<CommitListProps> = ({ commits, loading }) => {
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
        No commits to display.
      </div>
    );
  }

  return (
    <div className="commit-list">
      <h3>Commits to Deploy</h3>
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
            <tr key={commit.hash}>
              <td>{commit.hash.substring(0, 7)}</td>
              <td className="commit-message">{commit.message}</td>
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
