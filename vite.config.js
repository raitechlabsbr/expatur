import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:8080';

  return {
    root: '.',
    publicDir: 'public',

    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          main: './index.html',
        },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/@supabase')) return 'supabase';
          }
        },
        external: [],
      },
      target: 'es2020',
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: false,
          passes: 2,
          pure_funcs: [],
        },
        mangle: true,
      },
      chunkSizeWarningLimit: 900,
    },

    optimizeDeps: {
      exclude: [],
    },

    server: {
      port: 3000,
      open: '/',
      proxy: {
        '/finance': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        }
      }
    }
  };
});
