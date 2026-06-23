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

async function main() {
  console.log("Generating icons...");
  
  const baseBuffer = Buffer.from(svgString);

  // Logo webp (we crop the SVG bounds approx)
  await sharp(baseBuffer)
    .extract({ left: 30, top: 70, width: 452, height: 260 })
    .webp({ quality: 100 })
    .toFile(path.join(process.cwd(), 'public', 'logo.webp'));

  // 512x512 png
  await sharp(baseBuffer)
    .png()
    .toFile(path.join(process.cwd(), 'public', 'icon-512.png'));

  // apple-touch-icon.png (180x180, often with solid background)
  await sharp(baseBuffer)
    .resize(180, 180)
    .flatten({ background: '#000000' })
    .png()
    .toFile(path.join(process.cwd(), 'public', 'apple-touch-icon.png'));

  // Other sizes
  const sizes = [192, 64, 32];
  for (const size of sizes) {
    await sharp(baseBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(process.cwd(), 'public', `icon-${size}.png`));
  }

  // Also write the SVG file
  await fs.writeFile(path.join(process.cwd(), 'public', 'icon.svg'), svgString);
  await fs.writeFile(path.join(process.cwd(), 'public', 'favicon.svg'), svgString);

  console.log("Done generating icons.");
}

main().catch(console.error);
