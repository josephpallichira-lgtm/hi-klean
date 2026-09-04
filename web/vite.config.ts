import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

/**
 * Two build targets, same source:
 *   default            -> public/index.html for the hosted app (Express serves it)
 *   HK_SINGLEFILE=1    -> one self-contained .html that runs from file:// (offline edition)
 *
 * The single-file build is not a nicety: the clinic keeps an offline copy that
 * must open from a pen drive with no server. Inlining everything is what makes
 * that possible, so it is a first-class build, not an afterthought.
 */
const singleFile = process.env.HK_SINGLEFILE === '1';

export default defineConfig({
  plugins: [react(), ...(singleFile ? [viteSingleFile()] : [])],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@features': path.resolve(__dirname, 'src/features'),
    },
  },
  build: {
    outDir: singleFile ? 'dist-single' : '../public',
    emptyOutDir: true,
    target: 'es2020',
    // The hosted build is served by Express from /public; asset URLs must be absolute.
    assetsDir: 'assets',
    rollupOptions: singleFile ? { output: { inlineDynamicImports: true } } : {},
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
