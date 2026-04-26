var CACHE_NAME = "dare2know-v3";

self.addEventListener("install", function(event) {
  self.skipWaiting();
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
          .map(function(n) { return caches.delete(n); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(event) {
  if (event.request.method !== "GET") return;
  var url = event.request.url;
  if (url.includes("/api/") || url.includes("supabase")) return;

  event.respondWith(
    fetch(event.request).then(function(response) {
      if (response.ok) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
      }
      return response;
    }).catch(function() {
      return caches.match(event.request);
    })
  );
});

self.addEventListener("push", function(event) {
  var data = { title: "Dare2Know 🧠", body: "עדכון חדש מחכה לך!" };
  try { data = event.data.json(); } catch(e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      dir: "rtl",
      data: { url: data.url || "/" }
    })
  );
});

self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});