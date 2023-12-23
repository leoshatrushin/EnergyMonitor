import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(mode => {
    if (!mode) mode = 'dev';
    return {
        plugins: [react()],
        root: 'src',
        build: {
            rollupOptions: {
                input: {
                    main: 'src/index.html',
                    login: 'src/login.html',
                },
            },
            minify: mode == 'prod',
            sourcemap: mode == 'dev',
        },
    };
});
