import React, { useState, useEffect } from 'react';
const { ipcRenderer } = window.require('electron');

interface FileListResponse {
  success: boolean;
  files?: string[];
  error?: string;
}

const App: React.FC = () => {
  const [path, setPath] = useState<string>('');
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  // Set up IPC listener when component mounts
  useEffect(() => {
    ipcRenderer.on('directory-listed', (_, result: FileListResponse) => {
      setLoading(false);
      
      if (result.success && result.files) {
        setFiles(result.files);
        setError(null);
      } else {
        setFiles([]);
        setError(result.error || 'Unknown error occurred');
      }
    });

    // Clean up listener when component unmounts
    return () => {
      ipcRenderer.removeAllListeners('directory-listed');
    };
  }, []);

  const handleListFiles = () => {
    if (!path.trim()) {
      setError('Please enter a valid folder path');
      return;
    }

    // Request the main process to list files from the specified directory
    ipcRenderer.send('list-directory', path);
    
    // Show loading state
    setLoading(true);
    setError(null);
  };

  return (
    <div className="container">
      <h1>Simple File Explorer</h1>
      
      <div className="input-group">
        <input 
          type="text" 
          className="path-input"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="Enter folder path (e.g., C:\Users\MyUser\Documents)" 
        />
        <button 
          className="list-btn"
          onClick={handleListFiles}
        >
          List Files
        </button>
      </div>
      
      <div className="file-list">
        {loading ? (
          <p className="loading">Loading files...</p>
        ) : error ? (
          <div className="error">{error}</div>
        ) : files.length === 0 ? (
          <p>No files found or enter a path to begin</p>
        ) : (
          files.map((file, index) => (
            <div key={index} className="file-item">
              {file}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default App;
