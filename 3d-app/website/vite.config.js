import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
    // Relative asset URLs, so the built site also works from a sub-folder
    // (e.g. https://example.com/3deez/).
    base: command === 'build' ? './' : undefined,
    plugins: [
        laravel({
            input: ['resources/js/main.tsx'],
            refresh: true,
        }),
        react(),
    ],
}));
