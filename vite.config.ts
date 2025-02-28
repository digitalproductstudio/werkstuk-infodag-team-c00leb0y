import { defineConfig } from 'vite';

export default defineConfig({
  root: './', // Ensure the root is set to the project directory
  build: {
    outDir: 'dist', // Output directory for the build
  },
});