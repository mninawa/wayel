import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Workspace-wide unit test runner.
 *
 * Scope: pure TypeScript modules from `packages/shared` (i18n helpers,
 * mock services, partnership graph, validators). Anything that needs
 * Angular's `TestBed`/zone.js belongs in a future Angular-specific runner;
 * for now we keep the test surface small, fast and dependency-light so
 * `npm test` runs in <1s on a clean checkout.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@wayel/shared': resolve(here, 'packages/shared/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.spec.ts', 'tests/unit/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    reporters: process.env['CI'] ? ['default', 'github-actions'] : ['default'],
    globals: false,
    passWithNoTests: false,
    clearMocks: true,
  },
});
