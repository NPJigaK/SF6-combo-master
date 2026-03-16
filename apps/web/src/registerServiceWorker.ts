export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // Keep the browser shell usable even when offline registration fails.
    });
  });
}
