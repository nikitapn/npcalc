import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const srcDir = fileURLToPath(new URL('./src', import.meta.url))
const rpcDir = fileURLToPath(new URL('../client/src/rpc', import.meta.url))
const nprpcEsm = fileURLToPath(new URL('../external/nprpc/nprpc_js/dist/index.esm.js', import.meta.url))
const swiftProxyTarget = process.env.NSCALC_SWIFT_PROXY_TARGET ?? 'http://localhost:8443'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/host.json': {
        target: swiftProxyTarget,
        changeOrigin: true,
        secure: false,
      },
      '/mock': {
        target: swiftProxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      '@/': path.resolve(srcDir) + '/',
      '@rpc/': path.resolve(rpcDir) + '/',
      'nprpc': path.resolve(nprpcEsm),
    },
  }
})
