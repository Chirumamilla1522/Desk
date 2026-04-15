// Desk UI entrypoint: stable URL for `<script type="module">`; cache-bust the large bundle here only.
import { DESK_ASSET_VERSION } from './version.mjs';

await import(`../app.js?v=${encodeURIComponent(DESK_ASSET_VERSION)}`);

