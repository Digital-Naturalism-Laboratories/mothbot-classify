import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist', 'dev-dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      // Spreading an array into call arguments passes every element on the
      // stack; Chrome's V8 throws "Maximum call stack size exceeded" past
      // ~110k elements. A 160k-detection night crashed Classify this way, and
      // the Bun/JavaScriptCore test runtime tolerates it, so tests can't catch
      // it. Use a loop (or reduce) for anything that can grow with the data.
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name=/^(push|unshift)$/] > SpreadElement",
          message: 'arr.push(...items) overflows the stack on large arrays in Chrome. Use a loop.',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name=/^(max|min)$/] > SpreadElement",
          message: 'Math.max/min(...items) overflows the stack on large arrays in Chrome. Use a loop or reduce.',
        },
        {
          selector: "CallExpression[callee.property.name='fromCharCode'] > SpreadElement",
          message: 'String.fromCharCode(...bytes) overflows the stack on large inputs in Chrome. Decode in chunks or use TextDecoder.',
        },
      ],
    },
  },
])
