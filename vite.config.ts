import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) {
              return 'vendor-firebase'
            }
            if (id.includes('react-dom') || id.includes('react-router') || id.includes('zustand')) {
              return 'vendor-react'
            }
            if (id.includes('@radix-ui') || id.includes('lucide-react') || id.includes('@remixicon') || id.includes('framer-motion')) {
              return 'vendor-ui'
            }
            if (id.includes('jszip') || id.includes('papaparse') || id.includes('date-fns')) {
              return 'vendor-utils'
            }
          }
        },
      },
    },
  },
})
