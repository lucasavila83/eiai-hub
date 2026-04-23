/**
 * Favicon with unread badge.
 *
 * Draws a red circle (with the count inside) on top of the site's original
 * favicon, then swaps it into the document. Works in all modern browsers.
 *
 * Usage:
 *   setFaviconBadge(3);   // shows favicon with "3" in a red badge
 *   setFaviconBadge(0);   // restores the clean favicon
 */

let originalImg: HTMLImageElement | null = null;
let originalLoaded: Promise<void> | null = null;
let originalHref: string | null = null;

function getFaviconHref(): string {
  // Prefer an explicit <link rel="icon"> already in the DOM
  const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (link?.href) return link.href;
  // Fallback to root /favicon.ico
  return `${window.location.origin}/favicon.ico`;
}

function ensureOriginal(): Promise<void> {
  if (originalLoaded) return originalLoaded;
  originalLoaded = new Promise<void>((resolve) => {
    try {
      const href = getFaviconHref();
      originalHref = href;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        originalImg = img;
        resolve();
      };
      img.onerror = () => resolve(); // Silently fail → no badge applied
      img.src = href;
    } catch {
      resolve();
    }
  });
  return originalLoaded;
}

function getOrCreateIconLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  return link;
}

export async function setFaviconBadge(count: number): Promise<void> {
  if (typeof document === "undefined") return;

  await ensureOriginal();

  // Restore clean icon when count = 0
  if (!count || count <= 0) {
    if (originalHref) getOrCreateIconLink().href = originalHref;
    return;
  }

  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Base image (favicon). If we couldn't load it, just a transparent bg.
  if (originalImg) {
    ctx.drawImage(originalImg, 0, 0, size, size);
  }

  // Badge geometry — top-right
  const badgeRadius = 22;
  const cx = size - badgeRadius - 2;
  const cy = badgeRadius + 2;

  // Outer white halo (contrast against any favicon color)
  ctx.beginPath();
  ctx.arc(cx, cy, badgeRadius + 3, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // Red fill
  ctx.beginPath();
  ctx.arc(cx, cy, badgeRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#ef4444"; // tailwind red-500
  ctx.fill();

  // Count text (cap at "9+")
  const text = count > 9 ? "9+" : String(count);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${text.length > 1 ? 26 : 32}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Nudge baseline up a hair for optical centering
  ctx.fillText(text, cx, cy + 1);

  const dataUrl = canvas.toDataURL("image/png");
  getOrCreateIconLink().href = dataUrl;
}
