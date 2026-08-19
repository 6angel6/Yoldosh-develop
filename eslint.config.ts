import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default tseslint.config(
   {
      ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
   },
   {
      files: ['src/**/*.ts', 'shared/**/*.ts', 'test/**/*.ts'],

      languageOptions: {
         parser: tseslint.parser,
         parserOptions: {
            // Отдельный проект: tsconfig.json не включает test/, а type-aware
            // правила без него не резолвят типы в тестах.
            project: './tsconfig.eslint.json',
            ecmaVersion: 'latest',
            sourceType: 'module',
         },
         globals: {
            ...globals.node,
         },
      },

      extends: [...tseslint.configs.recommended],

      rules: {
         // Дисциплина асинхронности: каждый промис либо await-ится, либо
         // явно помечен void с обработкой отказа внутри.
         '@typescript-eslint/no-floating-promises': 'error',
         '@typescript-eslint/no-misused-promises': 'error',

         // Логи идут через структурный логгер, а не в stdout напрямую.
         'no-console': 'error',

         // `declare global { namespace Express {...} }` — единственный способ
         // расширить типы Request.
         '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],

         // Переходный период: чинится в файлах, которые правим по другим поводам.
         '@typescript-eslint/no-explicit-any': 'warn',
         '@typescript-eslint/no-empty-object-type': 'warn',
         '@typescript-eslint/no-unused-vars': [
            'warn',
            {
               argsIgnorePattern: '^_',
               varsIgnorePattern: '^_',
               caughtErrorsIgnorePattern: '^_',
            },
         ],
      },
   },
   {
      // Dev-инструменты, запускаются руками вне рантайма — console уместен.
      files: ['shared/i18n/scripts/**/*.ts'],
      rules: {
         'no-console': 'off',
      },
   },
   eslintPluginPrettierRecommended,
);
