import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  minify: false,
  // Bundle internal workspace packages (shipped as TS source) into the output.
  noExternal: [/^@devflow\//],
});
