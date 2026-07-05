// Registers the generated service worker in production builds. Dev and unit
// runs skip it (no build-time sw.js, and it would interfere with HMR).

export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failing (unsupported / blocked) must never break the game.
    });
  });
}
