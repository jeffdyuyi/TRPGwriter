import { defineConfig } from 'vite';

export default defineConfig({
    // Set base to './' for relative paths (GitHub Pages compatible)
    base: '/TRPGwriter/',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: false,
        minify: 'esbuild'
    },
    server: {
        port: 3000,
        open: true
    }
});
