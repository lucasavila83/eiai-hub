/**
 * Favicon with unread badge — big red circle covering the favicon.
 *
 * Strategy (after a couple of failed iterations):
 *
 *   When count > 0:
 *     1. Generate a high-DPI red-circle PNG with the count drawn on it.
 *     2. Walk every existing <link rel="icon"> and stash its current
 *        href on the element itself, then point the href at our PNG.
 *     3. Also append our own <link rel="icon"> as a belt-and-suspenders
 *        — sized 16/32/48/64 so Chrome picks it whichever slot it's
 *        rendering, and last in <head> so it wins same-size ties.
 *
 *   When count = 0:
 *     1. Restore each link's stashed href.
 *     2. Remove our extra link.
 *
 * We deliberately don't *remove* React-managed link elements — that's
 * what triggered the "Cannot read properties of null (reading
 * 'removeChild')" crash earlier in the debugging session — we just
 * mutate their href, which React doesn't track because it doesn't
 * read the attribute back from the DOM.
 */

const BADGE_ATTR = "data-lesco-badge";
const ORIGINAL_HREF_ATTR = "data-lesco-original-href";
let currentBadgedCount = 0;
let cachedDataUrl: string | null = null;

function isBadgeLink(el: Element): boolean {
  return el.hasAttribute(BADGE_ATTR);
}

function getReactIconLinks(): HTMLLinkElement[] {
  if (typeof document === "undefined") return [];
  return Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="shortcut icon"]')
  ).filter((el) => !isBadgeLink(el));
}

function getOurBadgeLink(): HTMLLinkElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLLinkElement>(`link[${BADGE_ATTR}]`);
}

/** Big red circle with the count, painted across the whole canvas. */
function drawFullBadge(ctx: CanvasRenderingContext2D, size: number, count: number) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - Math.max(2, size / 32);

  ctx.fillStyle = "#ef4444";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(2, size / 32);
  ctx.stroke();

  const text = count > 99 ? "99" : String(count);
  ctx.fillStyle = "#ffffff";
  // Bigger font so it's still legible at 16x16
  const fontSize = text.length > 1 ? Math.round(size * 0.62) : Math.round(size * 0.75);
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + size * 0.04);
}

function buildBadgePngDataUrl(count: number): string | null {
  // 256 px source so even the 64-px tab slot Chrome may pick stays sharp
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawFullBadge(ctx, size, count);
  return canvas.toDataURL("image/png");
}

export async function setFaviconBadge(count: number): Promise<void> {
  if (typeof document === "undefined") return;

  const ourLink = getOurBadgeLink();
  const reactLinks = getReactIconLinks();

  if (!count || count <= 0) {
    // Restore React-managed icons to their original hrefs.
    for (const link of reactLinks) {
      const original = link.getAttribute(ORIGINAL_HREF_ATTR);
      if (original) {
        link.setAttribute("href", original);
        link.removeAttribute(ORIGINAL_HREF_ATTR);
      }
    }
    // Remove our extra link.
    if (ourLink && ourLink.parentNode) {
      ourLink.parentNode.removeChild(ourLink);
    }
    currentBadgedCount = 0;
    cachedDataUrl = null;
    return;
  }

  // Count unchanged AND we still have a cached PNG AND our link is in
  // the DOM → nothing to do.
  if (count === currentBadgedCount && cachedDataUrl && ourLink) return;

  const dataUrl = buildBadgePngDataUrl(count);
  if (!dataUrl) return;
  cachedDataUrl = dataUrl;

  // Patch the existing React icons. Stash the original href the first
  // time we touch them so we can restore on un-badge.
  for (const link of reactLinks) {
    if (!link.hasAttribute(ORIGINAL_HREF_ATTR)) {
      link.setAttribute(ORIGINAL_HREF_ATTR, link.getAttribute("href") || "");
    }
    link.setAttribute("href", dataUrl);
  }

  // Plus our own dedicated link, last in the head, sized to match the
  // common tab-icon slots so Chrome's tiebreaker (same-size → last in
  // document order) lands on us.
  if (ourLink) {
    ourLink.setAttribute("href", dataUrl);
  } else {
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
