/**
 * Vercel entry: default-export Express app (no listen).
 * Static UI is served from `public/` (see `npm run vercel-build`).
 */
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import app from './web/backend/app.mjs';

const root = dirname(fileURLToPath(import.meta.url));
config({ path: join(root, '.env') });

export default app;
