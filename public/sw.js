/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Service Worker Purge & Kill-Switch to resolve infinite caching issues in WebViews like Instagram
const CACHE_NAME = "tictactoe-purge-v2";

self.addEventListener("install", (event) => {
  // Force the new service worker to become active immediately
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Delete all client-side caches completely
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          console.log("[Service Worker] Purging cache:", key);
          return caches.delete(key);
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Do not intercept or cache any network requests
self.addEventListener("fetch", (event) => {
  // Let the browser perform standard network fetches
  return;
});
