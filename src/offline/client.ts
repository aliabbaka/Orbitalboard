/** Registration is public asset caching, not a solver, analytics call or user-data upload. */
export function installOffline(): void {
  const status = document.createElement('span'); status.id = 'offline-status'; status.className = 'tag'; status.setAttribute('role', 'status');
  document.querySelector('.header-actions')?.append(status);
  let ready = false;
  const update = () => { status.textContent = navigator.onLine ? ready ? 'OFFLINE ASSETS READY' : 'CACHING OFFLINE ASSETS…' : ready ? 'OFFLINE · LOCAL TOOLS' : 'OFFLINE · ASSETS NOT READY'; };
  update(); window.addEventListener('online', update); window.addEventListener('offline', update);
  if (!('serviceWorker' in navigator)) { status.textContent = 'OFFLINE CACHE UNSUPPORTED'; return; }
  void navigator.serviceWorker.register('/sw.js').then(async registration => { await navigator.serviceWorker.ready; ready = true; update(); if (registration.waiting) status.textContent = 'UPDATE READY · SAVE BEFORE RELOAD'; }).catch(() => { status.textContent = 'OFFLINE CACHE NOT READY'; });
}
