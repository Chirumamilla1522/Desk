/**
 * Vercel Serverless Function entry.
 *
 * Vercel reliably builds and runs files under `api/` with the Node runtime.
 * We route all requests (including `/`) to this handler via `vercel.json`.
 */
import app from '../web/backend/app.mjs';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load repo-root .env for local `vercel dev` (production uses Vercel env vars).
const root = dirname(dirname(fileURLToPath(import.meta.url)));
config({ path: join(root, '.env') });

export default app;

