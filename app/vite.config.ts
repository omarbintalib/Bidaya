import { createReadStream, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { FILES, trimData } from './src/data/files';

/**
 * The data files live in data/ at the root of the repository (one copy, edited in Excel).
 * This plugin serves them at /data/ during development and preview, and on build writes the ones the app reads into
 * dist/data/, trimmed to the columns it reads (src/data/files.ts).
 */
const DATA_DIR = resolve(__dirname, '..', 'data');
const isData = (name: string) => /\.(csv|geojson)$/i.test(name);

function sirahData(): Plugin {
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    const match = req.url?.match(/^\/data\/([^?#/]+)/);
    if (!match) return next();
    const name = decodeURIComponent(match[1]);
    if (!isData(name) || !readdirSync(DATA_DIR).includes(name)) return next();
    res.setHeader('Content-Type', name.endsWith('.csv') ? 'text/csv; charset=utf-8' : 'application/geo+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    createReadStream(resolve(DATA_DIR, name)).pipe(res);
  };
  return {
    name: 'sirah-data',
    configureServer(server) {
      server.middlewares.use(serve);
      // Reload the page when a data file is saved.
      server.watcher.add(DATA_DIR + '/*.{csv,geojson}');
      server.watcher.on('change', file => { if (file.startsWith(DATA_DIR) && isData(file)) server.ws.send({ type: 'full-reload' }); });
    },
    configurePreviewServer(server) { server.middlewares.use(serve); },
    generateBundle() {
      for (const name of Object.values(FILES)) {
        this.emitFile({ type: 'asset', fileName: `data/${name}`, source: trimData(name, readFileSync(resolve(DATA_DIR, name), 'utf8')) });
      }
    },
  };
}

/** "Ask the map" calls /api/ask; dev and preview forward it to the RAG backend (../backend, `uvicorn server:app`). */
const api = { '/api': { target: process.env.BIDAYAH_API ?? 'http://127.0.0.1:8000', changeOrigin: true } };

export default defineConfig({ plugins: [react(), sirahData()], server: { proxy: api }, preview: { proxy: api } });
