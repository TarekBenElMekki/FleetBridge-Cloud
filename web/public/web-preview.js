(() => {
  'use strict';
  // Deliberately no browser storage, credentials, remote synchronization or fake writes.
  document.documentElement.dataset.fleetbridgePreview = 'synthetic-read-only';
  const lock = () => {
    for (const id of ['edit-stage', 'edit-notes', 'contract-candidate-url', 'contract-candidate-name', 'contract-start']) {
      const el = document.getElementById(id); if (el) { el.disabled = true; el.title = 'Read-only demonstration'; }
    }
    const atlas = document.getElementById('atlas-frame');
    if (atlas) atlas.title = 'Public operator atlas — demo; changes are disabled';
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',lock); else lock();
})();
