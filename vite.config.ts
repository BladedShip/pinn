import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import fs from 'fs';
import path from 'path';
import type { ServerOptions } from 'https';

// Configure HTTPS - use custom certificates if available, otherwise let Vite generate them
const keyPath = path.resolve(__dirname, '.cert/key.pem');
const certPath = path.resolve(__dirname, '.cert/cert.pem');

let httpsConfig: boolean | ServerOptions = true;
if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  httpsConfig = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          ['babel-plugin-react-compiler', {
            runtimeModule: 'react/compiler-runtime',
          }],
        ],
      },
    }),
    visualizer({
      filename: './dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    // @ts-expect-error - Vite accepts boolean | ServerOptions but types are strict
    https: httpsConfig,
    host: '0.0.0.0', // Allow access from network (including IP addresses)
    strictPort: false,
  },
});
