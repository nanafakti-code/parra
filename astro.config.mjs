import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import preact from '@astrojs/preact';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  site: 'https://parragkgloves.es',
  integrations: [tailwind(), preact({ compat: true })],
  output: 'server',
  adapter: vercel(),
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  security: {
    checkOrigin: false,
  },
  vite: {
    ssr: {
      // pdfkit es un módulo CJS con streams de Node.js — no debe ser bundleado por Vite
      external: ['pdfkit'],
    },
  },
});

