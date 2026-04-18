import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/itinerary': 'http://localhost:8000',
      '/places': 'http://localhost:8000',
      '/trips': 'http://localhost:8000',
    },
  },
})
