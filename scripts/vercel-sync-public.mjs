#!/usr/bin/env node
/**
 * Copy web/frontend → public/ so Vercel’s CDN can serve the Desk UI
 * (express.static is ignored on Vercel for Express deployments).
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'web', 'frontend');
const dest = join(root, 'public');

if (!existsSync(src)) {
  console.error('vercel-sync-public: missing', src);
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('vercel-sync-public: copied', src, '→', dest);
