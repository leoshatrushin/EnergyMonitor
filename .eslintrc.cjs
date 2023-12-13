/* eslint-env node */
module.exports = {
    extends: ['eslint:recommended', 'prettier', 'plugin:@typescript-eslint/recommended'],
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    root: true,
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
            jsx: true,
        },
    },
    env: {
        es6: true,
        browser: true,
        node: true,
    },
    rules: {
        '@typescript-eslint/no-unused-vars': 'warn',
    },
};
