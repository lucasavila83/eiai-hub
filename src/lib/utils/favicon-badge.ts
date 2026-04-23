/**
 * Favicon with unread badge — big red circle filling the favicon.
 *
 * Why not show logo AND badge side by side?
 *   The browser renders the tab favicon at ~16×16 pixels. Splitting that
 *   square between a logo and a badge gives each ~8 pixels of real estate,
 *   which makes the unread count unreadable. SVG + widescreen viewBox is
 *   inconsistently supported by Chrome (it letterboxes or squashes).
 *
 *   So: while there are unread chats, the favicon becomes a big red circle
 *   with the count — same pattern as WhatsApp Web / Discord. When the
 *   count goes back to 0 we restore the original Lesco favicon.
 */

const FALLBACK_COLOR = "#ef4444"; // used only if the canvas path fails

type IconSnapshot = { rel: string; href: string; type: string | null; sizes: string | null };

let originalsSnapshot: IconSnapshot[] | null = null;
let currentBadgedCount = 0;

function snapshotOriginals() {
  if (originalsSnapshot) return;
  const links = Array.from(
    document.querySelectorAll<HTMLLinkElement>("link[rel~='icon'], link[rel='shortcut icon']")
  );
  originalsSnapshot = links.map((el) => ({
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
  if (!originalsSnapshot || originalsSnapshot.length === 0) return;
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

/** Draws a big red circle with the count across the whole canvas. */
function drawFullBadge(ctx: CanvasRenderingContext2D, size: number, count: number) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;

  // Red fill
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = FALLBACK_COLOR;
  ctx.fill();

  // Thin white border for contrast
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Big white count
  const text = count > 99 ? "99" : String(count);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${text.length > 1 ? 40 : 48}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + 2);
}

export async function setFaviconBadge(count: number): Promise<void> {
  if (typeof document === "undefined") return;

  snapshotOriginals();

  // count = 0 → restore original Lesco favicon
  if (!count || count <= 0) {
    if (currentBadgedCount > 0) {
      restoreOriginals();
      currentBadgedCount = 0;
    }
    return;
  }

  // Same count → nothing to do
  if (count === currentBadgedCount) return;

  // Draw red badge on a PNG canvas
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  drawFullBadge(ctx, size, count);

  const dataUrl = canvas.toDataURL("image/png");

  removeAllIconLinks();
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  link.href = dataUrl;
  document.head.appendChild(link);

  currentBadgedCount = count;
}
