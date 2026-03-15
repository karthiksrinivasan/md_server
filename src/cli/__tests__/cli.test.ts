import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { parseArgs, validateDirectory, buildEnvVars } from '../index';

describe('CLI arg parsing', () => {
  it('parses default values', () => {
    const opts = parseArgs(['node', 'md-serve', '/some/path']);
    expect(opts.port).toBe(3030);
    expect(opts.host).toBe('localhost');
    expect(opts.open).toBe(false);
    expect(opts.watch).toBe(true);
    expect(opts.targetDir).toBe('/some/path');
  });

  it('parses --port flag', () => {
    const opts = parseArgs(['node', 'md-serve', '/some/path', '--port', '8080']);
    expect(opts.port).toBe(8080);
  });

  it('parses -p short flag', () => {
    const opts = parseArgs(['node', 'md-serve', '/some/path', '-p', '9090']);
    expect(opts.port).toBe(9090);
  });

  it('parses --open flag', () => {
    const opts = parseArgs(['node', 'md-serve', '/some/path', '--open']);
    expect(opts.open).toBe(true);
  });

  it('parses -o short flag', () => {
    const opts = parseArgs(['node', 'md-serve', '/some/path', '-o']);
    expect(opts.open).toBe(true);
  });

  it('parses --host flag', () => {
    const opts = parseArgs(['node', 'md-serve', '/some/path', '--host', '0.0.0.0']);
    expect(opts.host).toBe('0.0.0.0');
  });

  it('parses --no-watch flag', () => {
    const opts = parseArgs(['node', 'md-serve', '/some/path', '--no-watch']);
    expect(opts.watch).toBe(false);
  });

  it('parses --include flag (repeatable)', () => {
    const opts = parseArgs(['node', 'md-serve', '/some/path', '--include', 'docs/**/*.md', '--include', 'specs/**/*.md']);
    expect(opts.include).toEqual(['docs/**/*.md', 'specs/**/*.md']);
  });

  it('parses --exclude flag (repeatable)', () => {
    const opts = parseArgs(['node', 'md-serve', '/some/path', '--exclude', 'drafts/**', '--exclude', 'archive/**']);
    expect(opts.exclude).toEqual(['drafts/**', 'archive/**']);
  });

  it('parses --filter flag as string', () => {
    const opts = parseArgs(['node', 'md-serve', '/some/path', '--filter', 'meeting']);
    expect(opts.filter).toBe('meeting');
  });

  it('resolves relative target dir to absolute', () => {
    const opts = parseArgs(['node', 'md-serve', '.']);
    expect(path.isAbsolute(opts.targetDir)).toBe(true);
  });
});

describe('validateDirectory', () => {
  it('returns true for existing directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
    expect(validateDirectory(tmpDir)).toBe(true);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns false for nonexistent path', () => {
    expect(validateDirectory('/nonexistent/path/xyz123')).toBe(false);
  });

  it('returns false for a file (not directory)', () => {
    const tmpFile = path.join(os.tmpdir(), 'cli-test-file-' + Date.now() + '.txt');
    fs.writeFileSync(tmpFile, 'test');
    expect(validateDirectory(tmpFile)).toBe(false);
    fs.unlinkSync(tmpFile);
  });
});

describe('buildEnvVars', () => {
  it('maps parsed args to environment variable object', () => {
    const env = buildEnvVars({
      targetDir: '/test/docs',
      port: 8080,
      host: '0.0.0.0',
      open: true,
      watch: false,
      include: ['docs/**'],
      exclude: ['drafts/**'],
      filter: 'spec',
    });

    expect(env.MD_SERVE_ROOT).toBe('/test/docs');
    expect(env.MD_SERVE_PORT).toBe('8080');
    expect(env.MD_SERVE_HOST).toBe('0.0.0.0');
    expect(env.MD_SERVE_OPEN).toBe('true');
    expect(env.MD_SERVE_WATCH).toBe('false');
    expect(env.MD_SERVE_FILTERS).toBeDefined();
    const filters = JSON.parse(env.MD_SERVE_FILTERS!);
    expect(filters.include).toEqual(['docs/**']);
    expect(filters.exclude).toEqual(['drafts/**']);
    expect(filters.filter).toBe('spec');
  });

  it('handles empty arrays and null filter', () => {
    const env = buildEnvVars({
      targetDir: '/test',
      port: 3030,
      host: 'localhost',
      open: false,
      watch: true,
      include: [],
      exclude: [],
      filter: null,
    });

    const filters = JSON.parse(env.MD_SERVE_FILTERS!);
    expect(filters.include).toEqual([]);
    expect(filters.exclude).toEqual([]);
    expect(filters.filter).toBeNull();
  });
});
