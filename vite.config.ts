import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // three.js alene fylder ca. 550 kB
  build: { chunkSizeWarningLimit: 800 },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
