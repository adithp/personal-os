import { defineConfig } from 'tsup';

// One self-contained file: the workspace packages and all libraries are bundled in, so the
// Docker image needs no node_modules.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/.*/],
  // Some bundled libraries still use require()
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
