/**
 * Favicon with unread badge — widescreen SVG layout.
 *
 * To keep BOTH the Lesco mark and a large red unread badge visible in the
 * tab, we render the favicon as an SVG with a 3:2 viewBox (96×64):
 *
 *   ┌──────────┬───────────────┐
 *   │          │               │
 *   │   LESCO  │     🔴 3      │
 *   │          │               │
 *   └──────────┴───────────────┘
 *
 * Chrome respects the SVG viewBox aspect ratio when rendering the tab icon,
 * so the badge stays big instead of being crushed to ~8 pixels like it would
 * in a square canvas split in half.
 *
 * When count = 0 we restore the original <link rel="icon"> tags.
 */

const LESCO_PINK = "#ec4899"; // matches the pink square in the sidebar logo
const LESCO_LETTER = "L";

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

/** Build the SVG string with logo-box on the left and red badge on the right. */
function buildSvg(count: number): string {
  const text = count > 99 ? "99" : String(count);
  // Digit text size shrinks a bit when there are 2 digits so it still fits
  const badgeFontSize = text.length > 1 ? 34 : 44;
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64">
  <!-- Lesco mark: pink rounded square with an "L" -->
  <rect x="2" y="2" width="36" height="60" rx="8" fill="${LESCO_PINK}"/>
  <text x="20" y="34" fill="#ffffff" font-family="Arial, sans-serif" font-weight="bold"
        font-size="44" text-anchor="middle" dominant-baseline="middle">${LESCO_LETTER}</text>

  <!-- Red unread badge, takes the full right side -->
  <circle cx="66" cy="32" r="28" fill="#ef4444" stroke="#ffffff" stroke-width="3"/>
  <text x="66" y="34" fill="#ffffff" font-family="Arial, sans-serif" font-weight="bold"
        font-size="${badgeFontSize}" text-anchor="middle" dominant-baseline="middle">${text}</text>
</svg>`.trim();
}

function svgDataUrl(svg: string): string {
  // Use URI-encoded SVG (no base64) to keep the URL compact and avoid btoa
  // issues with unicode.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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

  if (count === currentBadgedCount) return;

  const svg = buildSvg(count);
  const href = svgDataUrl(svg);

  removeAllIconLinks();
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/svg+xml";
  link.href = href;
  document.head.appendChild(link);

  currentBadgedCount = count;
}
