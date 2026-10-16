/**
 * App icons for phone install (PWA) and iOS, rendered from the "K" mark (src/app/icon.svg).
 *   node scripts/make-icons.mjs   ->  public/icons/icon-192.png, icon-512.png, maskable-512.png, src/app/apple-icon.png
 * Run again only when the mark changes (the PNGs are committed).
 */
import { mkdir, readFile } from "node:fs/promises";
import sharp from "sharp";

const svg = await readFile("src/app/icon.svg", "utf8");
// maskable: full-bleed background, mark inside the safe zone (80%)
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#2b3990"/><g transform="translate(8 8)">${svg
  .replace(/<svg[^>]*>|<\/svg>/g, "")
  .replace(/<rect width="64" height="64" rx="14" fill="#2b3990"\/>/, "")}</g></svg>`;
// iOS adds its own rounded corners: square background
const square = svg.replace('rx="14"', 'rx="0"');

await mkdir("public/icons", { recursive: true });
const render = (source, size, out) => sharp(Buffer.from(source), { density: (72 * size) / 64 }).resize(size, size).png().toFile(out);
await render(svg, 192, "public/icons/icon-192.png");
await render(svg, 512, "public/icons/icon-512.png");
await render(maskable, 512, "public/icons/maskable-512.png");
await render(square, 180, "src/app/apple-icon.png");
console.log("icons written");
