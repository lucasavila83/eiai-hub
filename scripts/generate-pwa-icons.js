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
  // Tight: logo fills ~90% of the canvas, centered, on a white background.
  const contentSize = Math.round(size * 0.9);
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
  // Maskable: logo fills ~66% of canvas (Android safe zone), background color.
  // The 33% margin guarantees the launcher crop (circle/squircle) doesn't
  // clip the logo.
  const contentSize = Math.round(size * 0.66);
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

  // Silence unused var
  void BG_DARK;
  console.log("\nDone.");
})();
