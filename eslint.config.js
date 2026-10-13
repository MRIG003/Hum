import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'docs/', 'public/css/'] },
  js.configs.recommended,
  { files: ['server/**/*.js', 'test/**/*.js', 'eslint.config.js'], languageOptions: { globals: globals.node, sourceType: 'module' } },
  { files: ['public/**/*.js'], languageOptions: { globals: globals.browser, sourceType: 'module' } },
  { rules: { 'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] } },
];
