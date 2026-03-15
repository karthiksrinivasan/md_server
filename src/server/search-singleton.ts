import { SearchIndex } from './search';

let instance: SearchIndex | null = null;

export function getSearchIndex(): SearchIndex {
  if (!instance) {
    instance = new SearchIndex();
  }
  return instance;
}

export function resetSearchIndex(): void {
  instance = null;
}
