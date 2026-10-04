// Service worker for the Saddlewood app (/app). It exists for one thing:
// notifications. It caches nothing and handles no fetches, because every
// screen in the app is live data about what the bot is doing right now.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// A notification may only ever open a screen of the app itself.
function inApp(url) {
  return typeof url === "string" && (url === "/app" || url.startsWith("/app/") || url.startsWith("/app?"));
}

self.addEventListener("push", (event) => {
  let note = {};
  try {
    note = event.data ? event.data.json() : {};
  } catch {
    note = { body: event.data ? event.data.text() : "" };
  }
  // Always show something: iOS drops a subscription that receives pushes and
  // shows nothing.
  event.waitUntil(
    self.registration.showNotification(note.title || "Saddlewood", {
      body: note.body || "",
      tag: note.tag || undefined,
      icon: "/icons/app-192.png",
      badge: "/icons/app-badge-96.png",
      data: { url: inApp(note.url) ? note.url : "/app" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const wanted = event.notification.data && event.notification.data.url;
  const url = inApp(wanted) ? wanted : "/app";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        const path = new URL(client.url).pathname;
        if (path === "/app" || path.startsWith("/app/")) {
          await client.focus();
          // The open app goes to the right screen itself (AppShell listens);
          // not every browser lets a service worker navigate a window.
          client.postMessage({ type: "bot-open", url });
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
