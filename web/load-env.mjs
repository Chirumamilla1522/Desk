/**
 * Preload for `npm run web`: loads repo-root `.env` before the server module runs
 * (so CAREER_OPS_CLOUD / Supabase vars work without direnv).
 */
import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', '.env');
config({ path: envPath });
