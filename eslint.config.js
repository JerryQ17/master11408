import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.wrangler/**',
      '.sites-runtime/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'worker-configuration.d.ts',
      'migrations/meta/**',
      '.vscode/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['src/**', '**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        location: 'readonly',
        history: 'readonly',
        URLSearchParams: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        Event: 'readonly',
        HTMLElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLDialogElement: 'readonly',
        AbortController: 'readonly',
        ResizeObserver: 'readonly',
        MutationObserver: 'readonly',
        getComputedStyle: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
      },
    },
    rules: {
      'vue/multi-word-component-names': ['error', { ignores: ['App'] }],
      'vue/no-v-html': 'off',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['tests/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  prettier,
);
