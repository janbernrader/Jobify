// A deliberately empty service worker.
//
// Jobify's data lives on the server, so there is nothing useful to serve offline and caching the
// app shell would only risk a stale bundle after an update. This exists because browsers require
// a service worker with a fetch handler before they treat a site as installable (and before they
// honour the manifest's share_target). The handler returns nothing, which leaves every request to
// the network, exactly as if no worker were registered.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
