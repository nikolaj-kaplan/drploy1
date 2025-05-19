import React, { useState, useEffect } from 'react';
import { SettingsService } from './services/SettingsService';
import Dashboard from './pages/Dashboard';
import InitialSetup from './pages/InitialSetup';
import SettingsPage from './pages/SettingsPage';

const App: React.FC = () => {
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Check if app is initialized by looking for saved settings
  useEffect(() => {
    const checkInitialization = async () => {
      try {
        const settings = await SettingsService.loadSettings();
        setIsInitialized(!!settings && !!settings.githubToken && !!settings.repositoryUrl);
      } catch (error) {
        console.error('Error checking initialization status:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkInitialization();
  }, []);

  const handleSetupComplete = () => {
    setIsInitialized(true);
  };

  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading application...</p>
      </div>
    );
  }

  if (!isInitialized) {
    return <InitialSetup onSetupComplete={handleSetupComplete} />;
  }

  return (
    <div className="app-container">      <header className="app-header">
        <h1>Git Deployment Manager</h1>
        <button className="settings-button" onClick={toggleSettings}>
          {showSettings ? 'Back to Dashboard' : 'Settings'}
        </button>
      </header>

      {showSettings ? (
        <SettingsPage onClose={toggleSettings} />
      ) : (
        <Dashboard />
      )}
    </div>
  );
};

export default App;
