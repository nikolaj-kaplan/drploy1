// filepath: c:\p\DR\electron-test\src\renderer\services\LogService.ts
const { ipcRenderer } = window.require('electron');

// Event emitter for log messages
class LogEventEmitter {
  private listeners: { (message: string): void }[] = [];
  
  // Add a listener for log events
  addListener(callback: (message: string) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }
  
  // Emit a log event
  emit(message: string) {
    this.listeners.forEach(listener => listener(message));
  }
}

// Create a singleton event emitter
const logEventEmitter = new LogEventEmitter();

// Initialize the IPC listener
ipcRenderer.on('log-message', (_, { message, isError }) => {
  logEventEmitter.emit(message);
});

// Log service for the renderer process
export const LogService = {
  /**
   * Add a listener for log messages
   */
  addLogListener: (callback: (message: string) => void) => {
    return logEventEmitter.addListener(callback);
  },
  
  /**
   * Log a message to the console and emit it to any listeners
   */
  log: (message: string, isError: boolean = false) => {
    //const timestamp = new Date().toLocaleTimeString();
    const logPrefix = isError ? '[ERROR]' : '[INFO]';
    const logMessage = `${logPrefix} ${message}`;
    
    console.log(logMessage);
    logEventEmitter.emit(logMessage);
    
    // Send back to main process for persistence
    ipcRenderer.send('log-from-renderer', { message, isError });
  }
};