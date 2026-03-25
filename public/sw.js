// Service Worker — Dare2Know
// Push Notifications + Network-first caching (always fresh)

var CACHE_NAME = "dare2know-v3"; // שונה מ-v2 ל-v3

// Install — skip waiting to activate immediately
self.addEventListener("install", function(event) {
  self.skipWaiting();
});

// Activate — clear old caches
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

// Fetch — network first, fallback to cache
self.addEventListener("fetch", function(event) {
  if (event.request.method !== "GET") return;
  var url = event.request.url;
  if (url.includes("/api/") || url.includes("supabase") || url.includes("paypal") || url.includes("googleapis")) return;

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

// Push notifications
self.addEventListener("push", function(event) {
  var data = { title: "Dare2Know 🧠", body: "יש לך עדכון חדש!", url: "/" };
  try {
    data = event.data.json();
  } catch(e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      dir: "rtl",
      lang: "he",
      tag: data.tag || "default",
      data: { url: data.url || "/" },
      actions: data.actions || []
    })
  );
});

self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  var url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        if (clientList[i].url.includes(self.location.origin) && "focus" in clientList[i]) {
          clientList[i].navigate(url);
          return clientList[i].focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
