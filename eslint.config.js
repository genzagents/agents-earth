import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      // These are multi-file browser scripts loaded via <script> tags.
      // They share globals across files (ColonyClient, SpriteManager, etc.)
      // so sourceType must be 'script' and cross-file references are expected.
      sourceType: 'script',
      globals: {
        ...globals.browser,
        // External library globals loaded from CDN
        maptilersdk: 'readonly',
      },
    },
    rules: {
      // Warn on unused vars — cross-file exports legitimately appear "unused"
      // in isolation (e.g. districts.js exports used in app.js via script tag).
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      // Warn (not error) on undef — ESLint processes each file in isolation
      // and cannot see globals from sibling script files.
      'no-undef': 'warn',
      // Allow empty catch blocks: common pattern for optional/best-effort ops
      // (e.g. stopping an audio oscillator that may already be stopped).
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
