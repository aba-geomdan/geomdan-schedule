import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteObfuscateFile } from 'vite-plugin-obfuscator'

export default defineConfig({
  base: '/geomdan-schedule/',
  plugins: [
    react(),
    viteObfuscateFile({
      compact: true,
      controlFlowFlattening: false,
      deadCodeInjection: false,
      stringArray: true,
      stringArrayThreshold: 0.75,
      stringArrayEncoding: ['base64'],
      identifierNamesGenerator: 'hexadecimal',
sourceMap: false,
    }),
  ],
  build: { outDir: 'dist', assetsDir: 'assets', sourcemap: false },
})
