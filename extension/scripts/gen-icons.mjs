/**
 * Generate PNG extension icons from an SVG template.
 * Uses sharp (installed as devDep) to rasterize.
 *
 * Usage: node scripts/gen-icons.mjs
 */
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "src", "icons");
mkdirSync(outDir, { recursive: true });

// A clean audit-themed SVG: document with checkmark
function makeSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#4f46e5"/>
    </linearGradient>
  </defs>
  <!-- Rounded square background -->
  <rect width="128" height="128" rx="24" fill="url(#bg)"/>
  <!-- Document shape -->
  <rect x="34" y="20" width="60" height="78" rx="6" fill="white" opacity="0.95"/>
  <!-- Text lines on document -->
  <rect x="44" y="34" width="32" height="4" rx="2" fill="#c7d2fe"/>
  <rect x="44" y="44" width="40" height="4" rx="2" fill="#c7d2fe"/>
  <rect x="44" y="54" width="26" height="4" rx="2" fill="#c7d2fe"/>
  <rect x="44" y="64" width="36" height="4" rx="2" fill="#c7d2fe"/>
  <!-- Checkmark circle -->
  <circle cx="82" cy="86" r="22" fill="#22c55e"/>
  <polyline points="72,86 79,93 93,79" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

const sizes = [16, 48, 128];

// Try sharp first, fallback to writing SVGs
let useSharp = false;
let sharp;
try {
  sharp = (await import("sharp")).default;
  useSharp = true;
} catch {
  console.log("sharp not found — writing SVG files (convert to PNG manually or install sharp)");
}

for (const size of sizes) {
  const svg = makeSvg(size);
  if (useSharp) {
    const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
    writeFileSync(join(outDir, `icon${size}.png`), buf);
    console.log(`Generated icon${size}.png`);
  } else {
    writeFileSync(join(outDir, `icon${size}.svg`), svg);
    console.log(`Generated icon${size}.svg`);
  }
}
