import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

const dir = typeof import.meta.dirname !== 'undefined' ? import.meta.dirname : path.resolve('.');

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
    },
    resolve: {
        alias: {
            '@': path.resolve(dir, './src'),
        },
    },
});
