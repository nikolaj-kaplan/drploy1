// Custom type definition for Electron in renderer process
interface Window {
  require: (module: string) => any;
}
