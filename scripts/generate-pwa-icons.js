/**
 * Generate PWA icons in multiple sizes from lesco-icon.png.
 *
 * Run with:
 *   node scripts/generate-pwa-icons.js
 *
 * Produces:
 *   public/icons/icon-192.png                (purpose "any")
 *   public/icons/icon-512.png                (purpose "any")
 *   public/icons/icon-192-maskable.png       (purpose "maskable", 10% safe-area padding)
 *   public/icons/icon-512-maskable.png       (purpose "maskable", 10% safe-area padding)
 *   public/apple-touch-icon.png              (180x180 for iOS home screen)
 *
 * The "any" icons are tight-cropped around the logo content so the hummingbird
 * fills the tile (previously the icon had too much whitespace and looked tiny
 * on the home screen). The "maskable" icons add the 10% safe zone Android
 * requires so adaptive-icon crops (circle/squircle) don't chop the logo.
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SOURCE = path.join(__dirname, "..", "public", "lesco-icon.png");
const OUT_DIR = path.join(__dirname, "..", "public", "icons");
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const BG_LIGHT = { r: 255, g: 255, b: 255, alpha: 1 };  // white background for "any"
const BG_DARK = { r: 15, g: 23, b: 42, alpha: 1 };       // dark background (#0f172a) as fallback

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function autoCropToContent(srcBuffer) {
  // Trim transparent/white borders so the logo fills the frame
  return await sharp(srcBuffer).trim({ threshold: 10 }).toBuffer();
}

async function renderTight(size, outPath) {
  // Tight: logo fills ~98% of the canvas, centered, on a white background.
  // (The trim already removes transparent/white padding, so 98% means the
  // hummingbird goes basically edge-to-edge — what the user saw as "too
  // small" was this value being 90%, which left a visible ~5% ring.)
  const contentSize = Math.round(size * 0.98);
  const trimmed = await autoCropToContent(fs.readFileSync(SOURCE));
  const resized = await sharp(trimmed)
    .resize(contentSize, contentSize, { fit: "contain", background: BG_LIGHT })
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG_LIGHT },
  })
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toFile(outPath);
  console.log(`✓ ${outPath} (${size}x${size})`);
}

async function renderMaskable(size, outPath) {
  // Maskable: logo fills ~80% of canvas (leaving Android safe zone around
  // edges for circle/squircle adaptive-icon crops). 80% is right at the
  // edge of the documented 10% safe zone on each side — the hummingbird
  // survives circle crops but still looks big. Previously this was 66%
  // which made the icon look dwarfed inside the tile.
  const contentSize = Math.round(size * 0.8);
  const trimmed = await autoCropToContent(fs.readFileSync(SOURCE));
  const resized = await sharp(trimmed)
    .resize(contentSize, contentSize, { fit: "contain", background: BG_LIGHT })
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG_LIGHT },
  })
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toFile(outPath);
  console.log(`✓ ${outPath} (${size}x${size}, maskable)`);
}

async function renderMonoBadge(size, outPath) {
  // Android status-bar notification badge: the OS treats this icon as a
  // stencil — it only uses the alpha channel and paints it in the status
  // bar tint color. So we produce a PURE-WHITE silhouette on TRANSPARENT
  // background. If we ship a full-color logo instead, Android reads the
  // opaque rectangle behind the logo as "the whole thing is a silhouette"
  // and draws an ugly white square — exactly what the user reported.
  //
  // The source lesco-icon.png has a solid WHITE background (no alpha
  // channel carrying the shape), so we can't use the alpha mask shortcut.
  // Instead we walk every pixel and classify it as "background" (white-ish
  // → transparent) or "foreground" (colored → pure white, fully opaque).
  const trimmed = await autoCropToContent(fs.readFileSync(SOURCE));
  const contentSize = Math.round(size * 0.85);
  const resized = await sharp(trimmed)
    .resize(contentSize, contentSize, { fit: "contain", background: BG_LIGHT })
    .removeAlpha()
    .toColorspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = resized;
  const w = info.width;
  const h = info.height;
  const channels = info.channels; // 3 (RGB)

  // Build an RGBA buffer: white where the logo is, transparent elsewhere.
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0, j = 0; i < data.length; i += channels, j += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // "Background" = close to white. Threshold 230 to keep antialiased
    // edges of the logo.
    const isBackground = r > 230 && g > 230 && b > 230;
    if (isBackground) {
      out[j] = 0;
      out[j + 1] = 0;
      out[j + 2] = 0;
      out[j + 3] = 0; // transparent
    } else {
      out[j] = 255;
      out[j + 1] = 255;
      out[j + 2] = 255;
      out[j + 3] = 255; // opaque white
    }
  }

  const silhouette = await sharp(out, {
    raw: { width: w, height: h, channels: 4 },
  })
    .png()
    .toBuffer();

  // Center on a transparent square canvas of the requested size
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: silhouette, gravity: "center" }])
    .png()
    .toFile(outPath);
  console.log(`✓ ${outPath} (${size}x${size}, mono badge)`);
}

(async () => {
  // Standard (tight-cropped) icons
  await renderTight(192, path.join(OUT_DIR, "icon-192.png"));
  await renderTight(512, path.join(OUT_DIR, "icon-512.png"));

  // Maskable icons for Android adaptive-icon support
  await renderMaskable(192, path.join(OUT_DIR, "icon-192-maskable.png"));
  await renderMaskable(512, path.join(OUT_DIR, "icon-512-maskable.png"));

  // Apple Touch (iOS home screen)
  await renderTight(180, path.join(PUBLIC_DIR, "apple-touch-icon.png"));

  // Also refresh the smaller favicons while we're at it (optional but matches
  // the same tight crop so the browser tab matches the installed app).
  await renderTight(32, path.join(PUBLIC_DIR, "favicon-32x32.png"));
  await renderTight(16, path.join(PUBLIC_DIR, "favicon-16x16.png"));

  // Monochrome notification badge — used by Notification API / push handler
  // via the `badge:` option so Android draws a recognizable silhouette in
  // the status bar instead of a generic white square.
  await renderMonoBadge(96, path.join(OUT_DIR, "badge-96.png"));
  await renderMonoBadge(72, path.join(OUT_DIR, "badge-72.png"));

  // Silence unused var
  void BG_DARK;
  console.log("\nDone.");
})();
