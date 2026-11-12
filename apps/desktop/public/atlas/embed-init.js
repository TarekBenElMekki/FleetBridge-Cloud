/* FleetBridge V2.2 Atlas: embedded state and fixed light appearance. */
(() => { if (new URLSearchParams(location.search).get('embedded') === '1') document.documentElement.classList.add('embedded'); document.documentElement.dataset.theme = 'light'; document.documentElement.style.colorScheme = 'light'; })();
