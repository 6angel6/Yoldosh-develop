import { defineConfig } from 'vitest/config';
import tsconfigPaths from "vite-tsconfig-paths";


export default defineConfig({
    plugins: [tsconfigPaths()],

    test: {
        globals: false,
        environment: 'node',
        setupFiles: ['./test/setup.ts'],
        // beforeAll в test/setup.ts пересоздаёт схему целиком
        // (db.sync({force:true}), 32 таблицы) для КАЖДОГО тест-файла.
        // Дефолтных 10с на это не хватает — сюита падала плавающе.
        hookTimeout: 60_000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.ts', 'shared/**/*.ts'],
            exclude: [
                '**/node_modules/**',
                '**/dist/**',
                '**/test/**',
                '**/*.test.ts',
                'src/main.ts',
                'shared/config/**',
                'shared/scripts/**',
            ],
        },
    },
});