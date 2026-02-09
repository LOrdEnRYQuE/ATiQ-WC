import typescript from '@rollup/plugin-typescript';

export default [
  // Browser build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'cjs',
      sourcemap: true
    },
    plugins: [typescript()],
    external: ['fs', 'path', 'crypto', 'url', 'util']
  },
  // Browser ESM build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.esm.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [typescript()],
    external: ['fs', 'path', 'crypto', 'url', 'util']
  },
  // Browser-specific build
  {
    input: 'src/runtime/browser/browser-runtime.ts',
    output: {
      file: 'dist/browser.js',
      format: 'cjs',
      sourcemap: true
    },
    plugins: [typescript()],
    external: ['fs', 'path', 'crypto', 'url', 'util']
  },
  // Browser-specific ESM build
  {
    input: 'src/runtime/browser/browser-runtime.ts',
    output: {
      file: 'dist/browser.esm.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [typescript()],
    external: ['fs', 'path', 'crypto', 'url', 'util']
  }
];
