import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor chunks for better caching and parallel loading
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-chakra': ['@chakra-ui/react', '@emotion/react', '@emotion/styled', 'framer-motion'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-stripe': ['@stripe/stripe-js', 'stripe'],
          'vendor-datepicker': ['react-datepicker'],
          'vendor-charts': ['recharts'],
          'vendor-query': ['@tanstack/react-query'],
        }
      }
    },
    chunkSizeWarningLimit: 500,
    sourcemap: false,
    // Minify with esbuild (faster) and drop console.log in prod
    minify: 'esbuild',
    target: 'es2020',
    cssMinify: true,
  }
})
