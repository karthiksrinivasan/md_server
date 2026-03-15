import { FileWatcher } from './watcher';

let instance: FileWatcher | null = null;

export function getFileWatcher(): FileWatcher {
  if (!instance) {
    instance = new FileWatcher();
  }
  return instance;
}

export function resetFileWatcher(): void {
  instance = null;
}
