// Custom type definition for Electron in renderer process
interface Window {
  require: (module: string) => any;
  electronAPI: {
    openExternal: (url: string) => void;
  };
}
