export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = String(msg ?? '');
  el.classList.add('show');
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => el.classList.remove('show'), 2400);
}

