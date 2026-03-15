import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { resolveAssetPath, generateETag } from '../assets';

describe('resolveAssetPath', () => {
  const rootDir = path.join(os.tmpdir(), 'assets-test-' + Date.now());
  const imagesDir = path.join(rootDir, 'images');

  beforeAll(() => {
    fs.mkdirSync(imagesDir, { recursive: true });
    fs.writeFileSync(path.join(imagesDir, 'diagram.png'), 'fake-png-data');
    fs.writeFileSync(path.join(imagesDir, 'photo.jpg'), 'fake-jpg-data');
    fs.writeFileSync(path.join(imagesDir, 'icon.svg'), '<svg></svg>');
    fs.writeFileSync(path.join(imagesDir, 'doc.pdf'), 'fake-pdf-data');
    fs.writeFileSync(path.join(imagesDir, 'style.css'), 'body {}');
    fs.writeFileSync(path.join(imagesDir, 'script.js'), 'alert(1)');
    fs.writeFileSync(path.join(rootDir, 'photo.webp'), 'fake-webp');
    fs.writeFileSync(path.join(rootDir, 'anim.gif'), 'fake-gif');
  });

  afterAll(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('resolves a valid png path', () => {
    const result = resolveAssetPath(rootDir, 'images/diagram.png');
    expect(result).not.toBeNull();
    expect(result!.absolutePath).toBe(path.join(imagesDir, 'diagram.png'));
    expect(result!.contentType).toBe('image/png');
  });

  it('resolves a valid jpg path', () => {
    const result = resolveAssetPath(rootDir, 'images/photo.jpg');
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe('image/jpeg');
  });

  it('resolves svg with correct MIME', () => {
    const result = resolveAssetPath(rootDir, 'images/icon.svg');
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe('image/svg+xml');
  });

  it('resolves pdf with correct MIME', () => {
    const result = resolveAssetPath(rootDir, 'images/doc.pdf');
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe('application/pdf');
  });

  it('resolves webp at root level', () => {
    const result = resolveAssetPath(rootDir, 'photo.webp');
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe('image/webp');
  });

  it('resolves gif', () => {
    const result = resolveAssetPath(rootDir, 'anim.gif');
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe('image/gif');
  });

  it('returns null for disallowed type (css)', () => {
    const result = resolveAssetPath(rootDir, 'images/style.css');
    expect(result).toBeNull();
  });

  it('returns null for disallowed type (js)', () => {
    const result = resolveAssetPath(rootDir, 'images/script.js');
    expect(result).toBeNull();
  });

  it('returns null for path traversal attempt', () => {
    const result = resolveAssetPath(rootDir, '../../../etc/passwd');
    expect(result).toBeNull();
  });

  it('returns null for path traversal with encoded dots', () => {
    const result = resolveAssetPath(rootDir, 'images/../../etc/passwd');
    expect(result).toBeNull();
  });

  it('returns null for nonexistent file', () => {
    const result = resolveAssetPath(rootDir, 'images/nonexistent.png');
    expect(result).toBeNull();
  });
});

describe('generateETag', () => {
  const rootDir = path.join(os.tmpdir(), 'etag-test-' + Date.now());

  beforeAll(() => {
    fs.mkdirSync(rootDir, { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'file.png'), 'test-content');
  });

  afterAll(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('generates a string ETag', () => {
    const etag = generateETag(path.join(rootDir, 'file.png'));
    expect(typeof etag).toBe('string');
    expect(etag.length).toBeGreaterThan(0);
  });

  it('generates consistent ETag for same file', () => {
    const filePath = path.join(rootDir, 'file.png');
    const etag1 = generateETag(filePath);
    const etag2 = generateETag(filePath);
    expect(etag1).toBe(etag2);
  });

  it('generates different ETag after file modification', async () => {
    const filePath = path.join(rootDir, 'file.png');
    const etag1 = generateETag(filePath);
    await new Promise((r) => setTimeout(r, 50));
    fs.writeFileSync(filePath, 'modified-content');
    const etag2 = generateETag(filePath);
    expect(etag2).not.toBe(etag1);
  });
});
