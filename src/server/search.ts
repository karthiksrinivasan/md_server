import fs from 'node:fs/promises';
import path from 'node:path';
import MiniSearch from 'minisearch';
import matter from 'gray-matter';
import type { FilterConfig } from './config';
import { scanDirectory } from './tree';

export interface SearchResult {
  path: string;
  title: string;
  matches: { line: number; text: string }[];
}

interface IndexedDocument {
  id: string;
  path: string;
  filename: string;
  title: string;
  content: string;
}

function extractTitle(frontmatter: Record<string, unknown>, content: string): string {
  if (frontmatter.title && typeof frontmatter.title === 'string') {
    return frontmatter.title;
  }
  const headingMatch = content.match(/^#\s+(.+)$/m);
  return headingMatch ? headingMatch[1] : '';
}

function extractSnippets(content: string, query: string, maxSnippets = 3): { line: number; text: string }[] {
  const lines = content.split('\n');
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const snippets: { line: number; text: string }[] = [];
  for (let i = 0; i < lines.length && snippets.length < maxSnippets; i++) {
    const lineLower = lines[i].toLowerCase();
    if (queryTerms.some((term) => lineLower.includes(term))) {
      snippets.push({ line: i + 1, text: lines[i].trim() });
    }
  }
  return snippets;
}

function collectPaths(nodes: { name: string; path: string; type: string; children?: unknown[] }[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === 'file') paths.push(node.path);
    if (node.children) paths.push(...collectPaths(node.children as typeof nodes));
  }
  return paths;
}

export class SearchIndex {
  private miniSearch: MiniSearch<IndexedDocument>;
  private contentStore = new Map<string, string>();
  private rootDir = '';

  constructor() {
    this.miniSearch = new MiniSearch<IndexedDocument>({
      fields: ['path', 'filename', 'title', 'content'],
      storeFields: ['path', 'title'],
      searchOptions: {
        boost: { title: 3, filename: 2, path: 1, content: 1 },
        prefix: true,
        fuzzy: 0.2,
      },
    });
  }

  async build(rootDir: string, filters: FilterConfig): Promise<void> {
    this.rootDir = rootDir;
    const tree = await scanDirectory(rootDir, filters);
    const filePaths = collectPaths(tree);
    const documents: IndexedDocument[] = [];
    for (const relPath of filePaths) {
      const absPath = path.join(rootDir, relPath);
      try {
        const raw = await fs.readFile(absPath, 'utf-8');
        const { data: frontmatter, content } = matter(raw);
        const title = extractTitle(frontmatter, content);
        this.contentStore.set(relPath, raw);
        documents.push({ id: relPath, path: relPath, filename: path.basename(relPath), title, content });
      } catch {}
    }
    this.miniSearch.addAll(documents);
  }

  update(relPath: string, rawContent: string): void {
    const { data: frontmatter, content } = matter(rawContent);
    const title = extractTitle(frontmatter, content);
    try { this.miniSearch.discard(relPath); } catch {}
    this.miniSearch.vacuum();
    this.contentStore.set(relPath, rawContent);
    this.miniSearch.add({ id: relPath, path: relPath, filename: path.basename(relPath), title, content });
  }

  remove(relPath: string): void {
    try { this.miniSearch.discard(relPath); this.miniSearch.vacuum(); this.contentStore.delete(relPath); } catch {}
  }

  search(query: string): SearchResult[] {
    if (!query.trim()) return [];
    const results = this.miniSearch.search(query).slice(0, 20);
    return results.map((result) => {
      const raw = this.contentStore.get(result.id) ?? '';
      const snippets = extractSnippets(raw, query);
      return { path: result.path as string, title: (result.title as string) || path.basename(result.id), matches: snippets };
    });
  }
}
