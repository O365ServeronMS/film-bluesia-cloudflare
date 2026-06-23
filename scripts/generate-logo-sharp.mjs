import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

const svgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <!-- Background is transparent -->
  <g transform="translate(256, 260)">
    <text y="-30" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="160" fill="#FFFFFF" text-anchor="middle" letter-spacing="-6">BLUE</text>
    <text y="90" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="120" fill="#FFFFFF" text-anchor="middle" letter-spacing="-4">cine</text>
  </g>
</svg>
`;

const svgStringWithBg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="100%" height="100%" fill="#07090f" rx="100" />
  <g transform="translate(256, 260)">
    <text y="-30" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="160" fill="#FFFFFF" text-anchor="middle" letter-spacing="-6">BLUE</text>
    <text y="90" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="120" fill="#FFFFFF" text-anchor="middle" letter-spacing="-4">cine</text>
  </g>
</svg>
`;

async function main() {
  console.log("Generating icons...");
  
  const baseBuffer = Buffer.from(svgString);
  const baseBufferBg = Buffer.from(svgStringWithBg);

  // Logo webp (we crop the SVG bounds approx) - MUST be transparent
  await sharp(baseBuffer)
    .extract({ left: 30, top: 70, width: 452, height: 260 })
    .webp({ quality: 100 })
    .toFile(path.join(process.cwd(), 'public', 'logo.webp'));

  // 512x512 png with background
  await sharp(baseBufferBg)
    .png()
    .toFile(path.join(process.cwd(), 'public', 'icon-512.png'));

  // apple-touch-icon.png (180x180, often with solid background)
  await sharp(baseBufferBg)
    .resize(180, 180)
    .png()
    .toFile(path.join(process.cwd(), 'public', 'apple-touch-icon.png'));

  // Other sizes with background so they are visible on light browser tabs
  const sizes = [192, 64, 32];
  for (const size of sizes) {
    await sharp(baseBufferBg)
      .resize(size, size)
      .png()
      .toFile(path.join(process.cwd(), 'public', `icon-${size}.png`));
  }

  // Also write the SVG file (favicon.svg gets the background so it's visible in light tabs)
  await fs.writeFile(path.join(process.cwd(), 'public', 'icon.svg'), svgStringWithBg);
  await fs.writeFile(path.join(process.cwd(), 'public', 'favicon.svg'), svgStringWithBg);

  console.log("Done generating icons.");
}

main().catch(console.error);
