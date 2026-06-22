self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title ?? "Sponsor Monitor Update";
    const body = data.body ?? "";
    const tag = data.tag ?? "sponsor-default";
    const url = data.url ?? "/sponsor-monitor";

    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: "/icon-192x192.png",
        badge: "/icon-192x192.png",
        tag,
        data: { url },
        vibrate: [200, 100, 200],
      }),
    );
  } catch {
    const title = "Sponsor Monitor Update";
    event.waitUntil(
      self.registration.showNotification(title, {
        body: event.data.text(),
        icon: "/icon-192x192.png",
      }),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/sponsor-monitor";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const matching = windowClients.find((c) => c.url.includes(url));
      if (matching) {
        matching.focus();
      } else {
        clients.openWindow(url);
      }
    }),
  );
});
