import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const django = 'http://127.0.0.1:8000'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Django serves the production build from /static/ (see App/settings.py).
  base: command === 'build' ? '/static/' : '/',
  server: {
    proxy: {
      '/api': django,
      '/admin': django,
      '/static': django,
      '/ws': { target: django, ws: true },
    },
  },
}))
