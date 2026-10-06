import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    // shared/map.json lives outside web/ and is imported directly, never copied.
    fs: { allow: ['..'] },
  },
});
