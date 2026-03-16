let shakaLoadPromise: Promise<any> | null = null;

export function loadShakaPlayer(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Shaka Player can only load in the browser."));
  }

  if (window.shaka) {
    return Promise.resolve(window.shaka);
  }

  if (shakaLoadPromise) {
    return shakaLoadPromise;
  }

  shakaLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-shaka-player="public-bundle"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.shaka), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Shaka Player bundle.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "/scripts/shaka-player.dash.js";
    script.async = true;
    script.dataset.shakaPlayer = "public-bundle";
    script.onload = () => {
      if (window.shaka) {
        resolve(window.shaka);
        return;
      }
      reject(new Error("Shaka Player bundle loaded without exposing window.shaka."));
    };
    script.onerror = () => reject(new Error("Failed to load Shaka Player bundle."));
    document.head.appendChild(script);
  }).catch((error) => {
    shakaLoadPromise = null;
    throw error;
  });

  return shakaLoadPromise;
}