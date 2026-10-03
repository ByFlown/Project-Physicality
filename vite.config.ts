import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Project Physicality',
        short_name: 'Physicality',
        description: 'Level up every muscle. A full-body, muscle-by-muscle training progression tracker.',
        theme_color: '#0b0d12',
        background_color: '#0b0d12',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Body-scan models and WASM (~37 MB) are fetched on first scan and cached then, not precached.
        globIgnores: ['**/vision/**'],
        runtimeCaching: [
          {
            // The 3D body model (~1.4 MB per sex, content-hashed) is fetched when first needed.
            urlPattern: ({ url }) => url.pathname.endsWith('.bin'),
            handler: 'CacheFirst',
            options: { cacheName: 'body-model', expiration: { maxEntries: 4 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/vision/'),
            handler: 'CacheFirst',
            options: { cacheName: 'vision-models', expiration: { maxEntries: 12 } },
          },
        ],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  build: {
    // three.js is ~700 kB on its own; it lives in a lazily loaded chunk.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three') || id.includes('@react-three')) return 'three';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
