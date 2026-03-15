#!/usr/bin/env node

'use strict';

const path = require('path');
const fs = require('fs');

const compiledPath = path.join(__dirname, '..', '.next', 'standalone', 'src', 'cli', 'index.js');
const sourcePath = path.join(__dirname, '..', 'src', 'cli', 'index.ts');

if (fs.existsSync(compiledPath)) {
  require(compiledPath);
} else if (fs.existsSync(sourcePath)) {
  const { execFileSync } = require('child_process');
  const tsxBin = path.join(__dirname, '..', 'node_modules', '.bin', 'tsx');
  try {
    execFileSync(tsxBin, [sourcePath, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: process.env,
    });
  } catch (err) {
    process.exit(err.status ?? 1);
  }
} else {
  console.error('md-serve: CLI module not found. Run `npm run build` first.');
  process.exit(1);
}
