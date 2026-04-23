/**
 * Favicon with unread badge.
 *
 * Draws a red circle (with the count inside) on top of the site's original
 * favicon, then swaps it into the document.
 *
 * Design notes:
 *   - The page layout declares several favicon <link>s (16x16, 32x32, .ico,
 *     apple-touch-icon). When we only updated one of them, Chrome would often
 *     pick a different one and ignore our change. So when we apply a badge we
 *     REMOVE all existing icon links and insert a single data-URL icon.
 *   - We keep a cached copy of the original links so we can restore them when
 *     the unread count drops to 0.
 *   - If loading the original favicon fails (CORS, 404, etc.), we fall back
 *     to drawing a branded placeholder (indigo square + "L") so the badge is
 *     still visible.
 *
 * Usage:
 *   setFaviconBadge(3);   // favicon with "3" in a red badge
 *   setFaviconBadge(0);   // restores the original favicon
 */

const SOURCE_FAVICON = "/favicon-32x32.png";
const FALLBACK_COLOR = "#6366f1"; // indigo-500 — matches themeColor
const FALLBACK_LETTER = "L";

type IconSnapshot = { element: HTMLLinkElement; rel: string; href: string; type: string | null; sizes: string | null };

let originalImg: HTMLImageElement | null = null;
let originalLoaded: Promise<boolean> | null = null;
let originalsSnapshot: IconSnapshot[] | null = null;
let currentBadgedCount = 0;

function loadOriginalImage(): Promise<boolean> {
  if (originalLoaded) return originalLoaded;
  originalLoaded = new Promise<boolean>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      originalImg = img;
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = SOURCE_FAVICON;
  });
  return originalLoaded;
}

function snapshotOriginals() {
  if (originalsSnapshot) return;
  const links = Array.from(
    document.querySelectorAll<HTMLLinkElement>("link[rel~='icon'], link[rel='shortcut icon']")
  );
  originalsSnapshot = links.map((el) => ({
    element: el,
    rel: el.rel,
    href: el.href,
    type: el.getAttribute("type"),
    sizes: el.getAttribute("sizes"),
  }));
}

function removeAllIconLinks() {
  document
    .querySelectorAll<HTMLLinkElement>("link[rel~='icon'], link[rel='shortcut icon']")
    .forEach((el) => el.remove());
}

function restoreOriginals() {
  if (!originalsSnapshot) return;
  removeAllIconLinks();
  for (const snap of originalsSnapshot) {
    const link = document.createElement("link");
    link.rel = snap.rel;
    link.href = snap.href;
    if (snap.type) link.setAttribute("type", snap.type);
    if (snap.sizes) link.setAttribute("sizes", snap.sizes);
    document.head.appendChild(link);
  }
}

function drawBase(ctx: CanvasRenderingContext2D, size: number, loaded: boolean) {
  if (loaded && originalImg) {
    ctx.drawImage(originalImg, 0, 0, size, size);
    return;
  }
  // Fallback: solid rounded square with a single letter
  ctx.fillStyle = FALLBACK_COLOR;
  const r = 10;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 42px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(FALLBACK_LETTER, size / 2, size / 2 + 2);
}

function drawBadge(ctx: CanvasRenderingContext2D, size: number, count: number) {
  const badgeRadius = 22;
  const cx = size - badgeRadius - 2;
  const cy = badgeRadius + 2;

  // Outer white halo for contrast
  ctx.beginPath();
  ctx.arc(cx, cy, badgeRadius + 3, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // Red fill
  ctx.beginPath();
  ctx.arc(cx, cy, badgeRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#ef4444";
  ctx.fill();

  // Count text (cap at "9+")
  const text = count > 9 ? "9+" : String(count);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${text.length > 1 ? 24 : 32}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + 1);
}

export async function setFaviconBadge(count: number): Promise<void> {
  if (typeof document === "undefined") return;

  snapshotOriginals();

  if (!count || count <= 0) {
    if (currentBadgedCount > 0) {
      restoreOriginals();
      currentBadgedCount = 0;
    }
    return;
  }

  // No-op when the count hasn't changed
  if (count === currentBadgedCount) return;

  const loaded = await loadOriginalImage();

  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  drawBase(ctx, size, loaded);
  drawBadge(ctx, size, count);

  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL("image/png");
  } catch {
    // Tainted canvas (CORS). Redraw fallback only and retry.
    ctx.clearRect(0, 0, size, size);
    drawBase(ctx, size, false);
    drawBadge(ctx, size, count);
    dataUrl = canvas.toDataURL("image/png");
  }

  // Replace every icon link with a single data-URL icon so the browser can't
  // pick a stale one.
  removeAllIconLinks();
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  link.href = dataUrl;
  document.head.appendChild(link);

  currentBadgedCount = count;
}
