import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src/viewer',
  publicDir: resolve(__dirname, 'assets'),
  build: {
    outDir: resolve(__dirname, 'dist/viewer'),
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/viewer/index.html'),
        tileset: resolve(__dirname, 'src/viewer/tileset.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    open: true,
    fs: {
      allow: [resolve(__dirname)],
    },
  },
  plugins: [
    {
      name: 'serve-output',
      configureServer(server) {
        server.middlewares.use('/output', (req, res, next) => {
          const filePath = resolve(__dirname, 'output', req.url!.slice(1) || 'world.json');
          import('fs').then(fs => {
            if (fs.existsSync(filePath)) {
              res.setHeader('Content-Type', 'application/json');
              fs.createReadStream(filePath).pipe(res);
            } else {
              next();
            }
          });
        });
      },
    },
  ],
});
