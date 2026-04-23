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

/**
 * Side-by-side layout: Lesco logo on the left half, red badge on the right.
 * Both elements are sized to fill their own half (32×32 of a 64×64 canvas),
 * so when Chrome shrinks to 16×16 each gets ~8 pixels of real estate.
 */
function drawLogoLeft(ctx: CanvasRenderingContext2D, size: number, loaded: boolean) {
  const halfW = size / 2;
  if (loaded && originalImg) {
    // Fill the entire left half vertically — maximizes logo visibility
    ctx.drawImage(originalImg, 0, 0, halfW, size);
    return;
  }
  // Fallback: solid left-half with a big "L"
  ctx.fillStyle = FALLBACK_COLOR;
  ctx.fillRect(0, 0, halfW, size);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(FALLBACK_LETTER, halfW / 2, size / 2 + 1);
}

function drawBadgeRight(ctx: CanvasRenderingContext2D, size: number, count: number) {
  const halfW = size / 2;
  const cx = halfW + halfW / 2; // center of right half
  const cy = size / 2;
  const r = halfW / 2 - 1; // fills the right half almost edge-to-edge

  // Red fill
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#ef4444";
  ctx.fill();

  // Thin white border for contrast against the logo
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Count — as big as fits
  const text = count > 99 ? "99" : String(count);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${text.length > 1 ? 20 : 26}px Arial, sans-serif`;
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

  drawLogoLeft(ctx, size, loaded);
  drawBadgeRight(ctx, size, count);

  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL("image/png");
  } catch {
    // Tainted canvas (CORS) fallback: logo fallback + badge
    ctx.clearRect(0, 0, size, size);
    drawLogoLeft(ctx, size, false);
    drawBadgeRight(ctx, size, count);
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
