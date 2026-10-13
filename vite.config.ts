import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: {
    port: 5178,
    strictPort: true,
    watch: { ignored: ['**/mobile/**', '**/.local/**', '**/blender/**'] },
    proxy: {
      '/local': { target: 'http://127.0.0.1:8081', rewrite: (p) => p.replace(/^\/local/, '') },
      '/chat-local': {
        target: 'http://127.0.0.1:8082',
        rewrite: (p) => p.replace(/^\/chat-local/, ''),
      },
    },
  },
  build: { chunkSizeWarningLimit: 1500 },
});
