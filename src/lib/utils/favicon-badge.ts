/**
 * Favicon with unread badge — big red circle overlaying the original
 * favicon by simply prepending an extra <link> to <head>.
 *
 * Important: this used to wipe every <link rel="icon"> from <head> and
 * re-create them from a snapshot. That was catastrophic — Next.js
 * manages icon links from `metadata` in layout.tsx, and removing those
 * from under React's nose caused "Cannot read properties of null
 * (reading 'removeChild')" on the next commit, which aborted renders
 * mid-click and made the sidebar feel like it needed two taps to
 * navigate. Now we only ever touch a <link data-badge="true"> element
 * that we own; React's icons are left alone.
 *
 * Why red circle instead of badge-on-logo?
 *   The browser renders the tab favicon at ~16×16 pixels. Splitting
 *   that between a logo and a badge makes both unreadable. So while
 *   there are unread chats, the favicon becomes a big red circle with
 *   the count — same pattern as WhatsApp Web / Discord. When it goes
 *   back to 0 we remove our badge link and the React-managed icons
 *   take over again (they were never removed).
 */

const BADGE_ATTR = "data-lesco-badge";
let currentBadgedCount = 0;

/** Find our badge link element, if it has been inserted. */
function findBadgeLink(): HTMLLinkElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLLinkElement>(`link[${BADGE_ATTR}]`);
}

/** Draws a big red circle with the count across the whole canvas. */
function drawFullBadge(ctx: CanvasRenderingContext2D, size: number, count: number) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;

  // Red fill
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#ef4444";
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

  const existing = findBadgeLink();

  // count = 0 → pull our badge link off so the original favicon shows
  // through. React's icon <link>s were never removed, so nothing to
  // reinstate.
  if (!count || count <= 0) {
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    currentBadgedCount = 0;
    return;
  }

  // Same count, badge already drawn → nothing to do.
  if (count === currentBadgedCount && existing) return;

  // Draw red badge on a canvas and encode as a data URL.
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawFullBadge(ctx, size, count);
  const dataUrl = canvas.toDataURL("image/png");

  if (existing) {
    // Reuse the same link element so browsers just swap the bitmap.
    existing.setAttribute("href", dataUrl);
  } else {
    // Chrome's favicon algorithm:
    //   1. Filter <link rel="icon"> by sizes attribute relevant to the
    //      rendering slot (tab strip → 16/32 px).
    //   2. Among matches with the same size, pick the LAST one in
    //      document order.
    // So to win the tab icon we need (a) sizes that overlap what
    // Chrome wants AND (b) be appended AFTER React's icon links.
    // Declare the common tab sizes so we always tie one of them, then
    // appendChild so we're last in the head.
    const link = document.createElement("link");
    link.setAttribute(BADGE_ATTR, "true");
    link.rel = "icon";
    link.type = "image/png";
    link.setAttribute("sizes", "16x16 32x32 48x48 64x64");
    link.href = dataUrl;
    document.head.appendChild(link);
  }

  currentBadgedCount = count;
}
