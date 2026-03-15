import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { SearchIndex, type SearchResult } from '../search';

describe('SearchIndex', () => {
  const rootDir = path.join(os.tmpdir(), 'search-test-' + Date.now());

  beforeAll(() => {
    fs.mkdirSync(path.join(rootDir, 'guides'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'readme.md'), '---\ntitle: Getting Started\n---\n# Welcome\n\nThis is the main readme file.\nIt has multiple lines of content.\n');
    fs.writeFileSync(path.join(rootDir, 'guides', 'setup.md'), '---\ntitle: Setup Guide\n---\n# Setup\n\nInstall dependencies with npm install.\nConfigure the database connection.\n');
    fs.writeFileSync(path.join(rootDir, 'guides', 'deploy.md'), '# Deployment\n\nDeploy to production using docker.\nRun the deploy script.\n');
    fs.writeFileSync(path.join(rootDir, 'notes.md'), '# Meeting Notes\n\nDiscussed the deployment pipeline.\nReviewed database schema changes.\n');
  });

  afterAll(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('builds index from directory', async () => {
    const index = new SearchIndex();
    await index.build(rootDir, { include: [], exclude: [], filter: null });
    const results = index.search('readme');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].path).toBe('readme.md');
  });

  it('searches by frontmatter title', async () => {
    const index = new SearchIndex();
    await index.build(rootDir, { include: [], exclude: [], filter: null });
    const results = index.search('Getting Started');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.title === 'Getting Started')).toBe(true);
  });

  it('searches by content', async () => {
    const index = new SearchIndex();
    await index.build(rootDir, { include: [], exclude: [], filter: null });
    const results = index.search('database');
    expect(results.length).toBeGreaterThan(0);
    const paths = results.map((r) => r.path);
    expect(paths).toContain('guides/setup.md');
    expect(paths).toContain('notes.md');
  });

  it('returns matching line snippets', async () => {
    const index = new SearchIndex();
    await index.build(rootDir, { include: [], exclude: [], filter: null });
    const results = index.search('deploy');
    expect(results.length).toBeGreaterThan(0);
    const deployResult = results.find((r) => r.path === 'guides/deploy.md');
    expect(deployResult).toBeDefined();
    expect(deployResult!.matches.length).toBeGreaterThan(0);
    expect(deployResult!.matches.length).toBeLessThanOrEqual(3);
    expect(deployResult!.matches[0].text).toBeDefined();
    expect(deployResult!.matches[0].line).toBeGreaterThan(0);
  });

  it('limits results to 20', async () => {
    const index = new SearchIndex();
    await index.build(rootDir, { include: [], exclude: [], filter: null });
    const results = index.search('the');
    expect(results.length).toBeLessThanOrEqual(20);
  });

  it('returns empty array for no matches', async () => {
    const index = new SearchIndex();
    await index.build(rootDir, { include: [], exclude: [], filter: null });
    const results = index.search('xyznonexistentterm');
    expect(results).toEqual([]);
  });

  it('incrementally updates on file change', async () => {
    const index = new SearchIndex();
    await index.build(rootDir, { include: [], exclude: [], filter: null });
    index.update('readme.md', '---\ntitle: Updated Readme\n---\n# Updated\n\nThis file now mentions kubernetes.\n');
    const results = index.search('kubernetes');
    expect(results.length).toBe(1);
    expect(results[0].path).toBe('readme.md');
    expect(results[0].title).toBe('Updated Readme');
  });

  it('removes file from index', async () => {
    const index = new SearchIndex();
    await index.build(rootDir, { include: [], exclude: [], filter: null });
    const beforeResults = index.search('deployment');
    const hadNotes = beforeResults.some((r) => r.path === 'notes.md');
    expect(hadNotes).toBe(true);
    index.remove('notes.md');
    const afterResults = index.search('deployment');
    const stillHasNotes = afterResults.some((r) => r.path === 'notes.md');
    expect(stillHasNotes).toBe(false);
  });

  it('returns empty for empty query', async () => {
    const index = new SearchIndex();
    await index.build(rootDir, { include: [], exclude: [], filter: null });
    const results = index.search('');
    expect(results).toEqual([]);
  });
});
