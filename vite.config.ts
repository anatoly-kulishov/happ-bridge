import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

const leanBuild = {
  target: 'chrome130' as const,
  minify: 'esbuild' as const,
  cssMinify: true as const,
  sourcemap: false as const,
  reportCompressedSize: false as const,
}

export default defineConfig({
  resolve: {
    // Preact compat: same React API, ~⅓ the runtime weight.
    alias: {
      react: 'preact/compat',
      'react-dom/client': 'preact/compat/client',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
      'react/jsx-dev-runtime': 'preact/jsx-dev-runtime',
    },
    dedupe: ['preact'],
  },
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['debugger'] : [],
    legalComments: 'none',
  },
  build: {
    ...leanBuild,
    modulePreload: false,
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            ...leanBuild,
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'electron-updater'],
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            ...leanBuild,
            outDir: 'dist-electron',
          },
        },
      },
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
