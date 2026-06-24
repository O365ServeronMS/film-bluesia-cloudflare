import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

async function main() {
  console.log("Generating icons from public/logo-source.png...");
  
  const sourcePath = path.join(process.cwd(), 'public', 'logo-source.png');
  
  // Read the source PNG image
  const sourceImage = sharp(sourcePath);
  
  // Generate logo.webp
  await sourceImage.clone()
    .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .webp({ quality: 100 })
    .toFile(path.join(process.cwd(), 'public', 'logo.webp'));

  // 512x512 png with background (already has white background)
  await sourceImage.clone()
    .resize(512, 512, { fit: 'contain' })
    .png()
    .toFile(path.join(process.cwd(), 'public', 'icon-512.png'));

  // apple-touch-icon.png (180x180)
  await sourceImage.clone()
    .resize(180, 180, { fit: 'contain' })
    .png()
    .toFile(path.join(process.cwd(), 'public', 'apple-touch-icon.png'));

  // Other sizes with background so they are visible on light browser tabs
  const sizes = [192, 64, 32];
  for (const size of sizes) {
    await sourceImage.clone()
      .resize(size, size, { fit: 'contain' })
      .png()
      .toFile(path.join(process.cwd(), 'public', `icon-${size}.png`));
  }

  // Remove the old SVGs as we no longer have an SVG source
  try {
    await fs.unlink(path.join(process.cwd(), 'public', 'icon.svg'));
  } catch(e) {}
  try {
    await fs.unlink(path.join(process.cwd(), 'public', 'favicon.svg'));
  } catch(e) {}
  try {
    await fs.unlink(path.join(process.cwd(), 'public', 'logo.svg'));
  } catch(e) {}

  console.log("Done generating icons.");
}

main().catch(console.error);
