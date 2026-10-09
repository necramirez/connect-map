import javascript from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import typescript from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '.astro/**',
      'dist/**',
      'data/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  javascript.configs.recommended,
  typescript.configs.recommended,
  {
    files: ['src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
