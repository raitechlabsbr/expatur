import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Carrega variáveis do .env para o lado do servidor (vite.config.js)
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:8080';

  return {
  root: '.',
  publicDir: 'public',

  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index-app.html',
      },
      output: {
        // Supabase in its own chunk (loaded only when needed)
        manualChunks(id) {
          if (id.includes('node_modules/@supabase')) return 'supabase';
        }
      },
      // jsPDF, html2canvas, pdf-lib, xlsx are loaded from CDN via <script defer>
      // so they are NOT bundled — declare them as externals with their global names
      external: [],
    },

    // Modern browsers only — no legacy polyfills
    target: 'es2020',

    // Terser minification — removes whitespace, mangles names, dead-code elim
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,   // flip to true for prod deploy
        passes: 2,
        pure_funcs: [],
      },
      mangle: true,
    },

    // Warn only above 800KB (app.js is large by design)
    chunkSizeWarningLimit: 900,
  },

  optimizeDeps: {
    // Don't try to pre-bundle the app.js globals — they come from CDN
    exclude: [],
  },

  // Dev server — proxy /finance/* to PHP backend
  server: {
    port: 3000,
    open: '/index-app.html',
    proxy: {
      '/finance': {
        // Opção A: backend PHP local    → 'http://localhost:8080'
        // Opção B: servidor de produção → 'https://workspace.expaturtravel.com'
        // Opção C: desativar proxy       → remova este bloco e use VITE_API_URL no .env
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      }
    }
  }
  };
});
