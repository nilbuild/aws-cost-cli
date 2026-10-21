import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'dist',
    target: 'node16',
    platform: 'node',
    format: ['esm'],
    splitting: false,
    sourcemap: true,
    minify: false,
    shims: false,
    dts: false,
  },
  // AWS Lambda bundle: one self-contained file. The Lambda Node.js runtime
  // already ships AWS SDK v3, so @aws-sdk/* is left out to keep the zip small.
  {
    entry: { index: 'src/lambda.ts' },
    outDir: 'dist-lambda',
    target: 'node22',
    platform: 'node',
    format: ['esm'],
    outExtension: () => ({ js: '.mjs' }),
    splitting: false,
    sourcemap: false,
    minify: false,
    shims: false,
    dts: false,
    noExternal: [/^(?!@aws-sdk\/).*/],
    external: [/^@aws-sdk\//],
    // Some bundled CommonJS deps call require(); give the ESM bundle one
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
  },
]);
