#!/usr/bin/env node
/**
 * Wayel local dev launcher.
 *
 * Spawns the platform mock API and the Angular dev server side-by-side,
 * prefixing each line of output so you can tell them apart in one terminal.
 *
 * Usage (from repo root):
 *   node tools/dev.mjs
 *
 * Or via the npm script in apps/web-angular:
 *   npm run dev          # mock API + ng serve
 *   npm run dev:web      # ng serve only
 *   npm run dev:mock     # mock API only
 *
 * Notes:
 * - The Angular proxy.conf.json forwards /api → http://localhost:5280, so the
 *   mock must be running before the UI tries to call it.
 * - Set PORT to override the mock API port (defaults to 5280).
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = resolve(repoRoot, 'apps/web-angular');
const mockEntry = resolve(repoRoot, 'tools/platform-mock-api/server.mjs');

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
};

function prefixStream(stream, label, color) {
  let buf = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      process.stdout.write(`${color}[${label}]${colors.reset} ${line}\n`);
    }
  });
  stream.on('end', () => {
    if (buf.length > 0) {
      process.stdout.write(`${color}[${label}]${colors.reset} ${buf}\n`);
    }
  });
}

function start(label, color, command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    ...options,
  });
  prefixStream(child.stdout, label, color);
  prefixStream(child.stderr, label, colors.red);
  child.on('exit', (code, signal) => {
    const reason = signal ? `signal ${signal}` : `exit code ${code ?? 0}`;
    process.stdout.write(`${colors.yellow}[${label}]${colors.reset} stopped (${reason})\n`);
    shutdown(code ?? 0);
  });
  child.on('error', (err) => {
    process.stderr.write(`${colors.red}[${label}]${colors.reset} failed to start: ${err.message}\n`);
    shutdown(1);
  });
  return child;
}

const children = [];
let stopping = false;

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGINT');
    }
  }
  setTimeout(() => process.exit(code), 250).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

children.push(
  start('mock', colors.magenta, process.execPath, [mockEntry], {
    cwd: repoRoot,
    env: { ...process.env },
  }),
);

children.push(
  start('web ', colors.cyan, 'npx', ['ng', 'serve'], {
    cwd: webDir,
    env: { ...process.env, FORCE_COLOR: '1' },
  }),
);
