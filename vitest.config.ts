import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 80,
        functions: 75,
        branches: 65,
        statements: 80,
      },
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        'src/index.ts',
        'src/main.ts',
        'src/types/**/*.ts',
        'src/built-in-adapters/claude.ts',
        'src/built-in-adapters/codex.ts',
        'src/built-in-adapters/kimi.ts',
      ],
    },
  },
});
