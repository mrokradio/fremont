// @ts-check
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/prisma/migrations/**',
    ],
  },
  // TypeScript files across all packages
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      // Enforce explicit return types on public API functions
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Warn on unused variables but allow leading-underscore to opt out
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Allow 'any' sparingly — tighten later
      '@typescript-eslint/no-explicit-any': 'warn',
      // No floating promises
      '@typescript-eslint/no-floating-promises': 'error',
      // Consistent type imports
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      // No console — use Logger instead
      'no-console': 'warn',
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
