#!/usr/bin/env node
/**
 * Local HTTP server — loads repo-root `.env`, then listens.
 * Run: npm run web (uses web/load-env.mjs preload) or: node web/backend/server.mjs
 */
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getCareerOpsRoot } from './lib/tracker-store.mjs';
import app from './app.mjs';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, '..', '..', '.env') });

const PORT = Number(process.env.PORT) || 3847;
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`Career-Ops Web: http://${HOST}:${PORT}`);
  console.log(`Workspace: ${getCareerOpsRoot()}`);
});
