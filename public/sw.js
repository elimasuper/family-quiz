// Service Worker — Push Notifications for Family Quiz

self.addEventListener("push", function(event) {
  var data = { title: "חידון המשפחה 🎮", body: "יש לך עדכון חדש!", url: "/" };
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
