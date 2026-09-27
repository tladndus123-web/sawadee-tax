// Home-screen app icons (PWA manifest) from app/icon.svg. Run: node scripts/make-app-icons.mjs
// - icon-192 / icon-512: the rounded tile as is
// - maskable-512: full-bleed square with the drawing shrunk into the safe circle, for Android's own icon shapes
import fs from "node:fs";
import sharp from "sharp";

const svg = fs.readFileSync("app/icon.svg", "utf8");
const maskable = svg
  .replaceAll('rx="15"', 'rx="0"')
  .replace("translate(32 32) scale(1.1) translate(-32 -32)", "translate(32 32) scale(0.86) translate(-32 -32)");

for (const [name, src, size] of [
  ["icon-192.png", svg, 192],
  ["icon-512.png", svg, 512],
  ["maskable-512.png", maskable, 512],
]) {
  await sharp(Buffer.from(src), { density: 72 * (size / 64) }).resize(size, size).png().toFile(`public/icons/${name}`);
  console.log(name);
}
