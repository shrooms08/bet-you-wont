// Builds every app icon from public/brand/byw-mark.svg (the mark's geometry is used as-is).
//   node scripts/icons.mjs
// Writes:
//   public/icon.svg                      favicon (vector): rounded #131317 tile, mark ~80% wide
//   public/favicon.ico                   16 + 32 px PNGs in one .ico
//   public/icons/favicon-16.png, -32.png
//   public/icons/icon-192.png, -512.png  PWA icons: rounded tile, mark ~60% wide, transparent corners
//   public/icons/icon-maskable-512.png   full-bleed #131317, mark ~60% wide (inside the 80% safe zone)
//   public/apple-touch-icon.png          180 px, full-bleed square (iOS rounds the corners itself)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const pub = new URL("../public/", import.meta.url).pathname;
const BG = "#131317";
const src = readFileSync(`${pub}brand/byw-mark.svg`, "utf8");
// Everything inside the outer <svg>: the mask defs and the transformed group.
const inner = src.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
// The mark spans x 51-973 (922 wide) of the 1024 canvas and is centred on (512, 512).
const MARK_W = 922;

function iconSvg({ widthShare, radius }) {
  const k = (widthShare * 1024) / MARK_W;
  const bg = radius === null ? "" : `<rect width="1024" height="1024" rx="${radius}" fill="${BG}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${bg}<g transform="translate(512 512) scale(${k.toFixed(5)}) translate(-512 -512)">${inner}</g></svg>`;
}

const favicon = iconSvg({ widthShare: 0.8, radius: 228 });
const app = iconSvg({ widthShare: 0.6, radius: 228 });
const fullBleed = iconSvg({ widthShare: 0.6, radius: 0 });

const png = (svg, size) => sharp(Buffer.from(svg), { density: 72 * (size / 1024) * 4 }).resize(size, size).png().toBuffer();

mkdirSync(`${pub}icons`, { recursive: true });
writeFileSync(`${pub}icon.svg`, favicon);
const f16 = await png(favicon, 16);
const f32 = await png(favicon, 32);
writeFileSync(`${pub}icons/favicon-16.png`, f16);
writeFileSync(`${pub}icons/favicon-32.png`, f32);
writeFileSync(`${pub}icons/icon-192.png`, await png(app, 192));
writeFileSync(`${pub}icons/icon-512.png`, await png(app, 512));
writeFileSync(`${pub}icons/icon-maskable-512.png`, await png(fullBleed, 512));
writeFileSync(`${pub}apple-touch-icon.png`, await png(fullBleed, 180));

// .ico with PNG entries (supported by every current browser).
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size === 256 ? 0 : size, e);
    header.writeUInt8(size === 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((im) => im.data)]);
}
writeFileSync(`${pub}favicon.ico`, ico([{ size: 16, data: f16 }, { size: 32, data: f32 }]));
console.log("wrote icon.svg, favicon.ico, apple-touch-icon.png, icons/{favicon-16,favicon-32,icon-192,icon-512,icon-maskable-512}.png");
