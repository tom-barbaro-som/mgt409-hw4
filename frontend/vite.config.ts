import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// FastAPI (backend/main.py) serves the catalogue API and product images.
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://127.0.0.1:8000'
const backendProxy = {
  '/api': BACKEND_URL,
  '/media': BACKEND_URL,
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy: backendProxy },
  preview: { proxy: backendProxy },
})
