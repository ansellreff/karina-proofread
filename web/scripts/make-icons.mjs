/**
 * The app logo and icons, rendered from Karina's logo (weblogo/karinabotlogo.png, 2000 px, transparent):
 *   node scripts/make-icons.mjs
 *   -> public/icons/logo.png (header), src/app/icon.png (browser tab),
 *      public/icons/icon-192.png, icon-512.png, maskable-512.png (phone install), src/app/apple-icon.png (iOS)
 * Run again only when the logo changes (the small PNGs are committed; the 2.4 MB original is not shipped).
 */
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const SOURCE = "../weblogo/karinabotlogo.png";
/** White behind the logo where a background is needed (its navy outlines need a light ground). */
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

// the figure only: the words "KARINA PROOFREAD BOT" under it (black) can't be read at icon size and vanish on dark
// backgrounds, and the header writes the name anyway. Cut above them, trim the transparent margin, square it again.
const FIGURE_BOTTOM = 1720; // px in the 2000 px original: below the circle, above the words
const figure = await sharp(SOURCE).extract({ left: 0, top: 0, width: 2000, height: FIGURE_BOTTOM }).png().toBuffer();
const trimmed = await sharp(figure).trim({ threshold: 1 }).toBuffer();
const { width, height } = await sharp(trimmed).metadata();
const side = Math.max(width, height);
const square = await sharp(trimmed)
  .extend({ top: Math.floor((side - height) / 2), bottom: Math.ceil((side - height) / 2), left: Math.floor((side - width) / 2), right: Math.ceil((side - width) / 2), background: CLEAR })
  .png()
  .toBuffer();

/** The logo at `size`, filling `share` of it, on `background`. */
const render = async (size, share, background, out) => {
  const inner = Math.round(size * share);
  const logo = await sharp(square).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(out);
};

await mkdir("public/icons", { recursive: true });
await render(128, 1, CLEAR, "public/icons/logo.png"); // header: shown at 32-36 px, sharp on 3x screens
await render(64, 1, CLEAR, "src/app/icon.png"); // browser tab
await render(192, 0.9, WHITE, "public/icons/icon-192.png");
await render(512, 0.9, WHITE, "public/icons/icon-512.png");
await render(512, 0.72, WHITE, "public/icons/maskable-512.png"); // inside Android's safe zone (80%)
await render(180, 0.86, WHITE, "src/app/apple-icon.png"); // iOS rounds the corners itself
console.log(`icons written (logo trimmed to ${width}x${height})`);
