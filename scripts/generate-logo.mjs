import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

const HTML_CONTENT = `
<!DOCTYPE html>
<html>
  <head>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@900&display=swap" rel="stylesheet">
    <style>
      :root {
        --grad: linear-gradient(135deg, #48007E 0%, #1D2AC4 50%, #007DFF 100%);
      }
      body {
        margin: 0;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        width: max-content;
        height: max-content;
      }
      .logo-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: transparent;
      }
      .logo-text {
        font-family: 'Montserrat', sans-serif;
        font-weight: 900;
        text-align: center;
        line-height: 0.8;
        background: var(--grad);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .blue {
        font-size: 160px;
        letter-spacing: -6px;
        margin-left: -6px;
      }
      .cine {
        font-size: 110px;
        letter-spacing: -4px;
        margin-top: 0px;
      }
      
      /* Square container for icons */
      .icon-container {
        width: 512px;
        height: 512px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
      }
      .icon-container .logo-text {
        transform: scale(0.9);
      }
    </style>
  </head>
  <body>
    <div id="raw-logo" class="logo-text" style="padding: 10px;">
      <div class="blue">BLUE</div>
      <div class="cine">cine</div>
    </div>
    
    <div id="icon-512" class="icon-container" style="position: absolute; top: -2000px;">
      <div class="logo-text">
        <div class="blue">BLUE</div>
        <div class="cine">cine</div>
      </div>
    </div>
  </body>
</html>
`;

async function main() {
  console.log("Launching Puppeteer...");
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.setContent(HTML_CONTENT, { waitUntil: 'networkidle0' });
  
  // Wait a bit to ensure font is fully applied
  await new Promise(r => setTimeout(r, 1000));
  
  console.log("Taking screenshot for logo.webp...");
  const rawLogo = await page.$('#raw-logo');
  await rawLogo.screenshot({
    path: path.join(process.cwd(), 'public', 'logo.webp'),
    type: 'webp',
    omitBackground: true
  });
  
  console.log("Taking screenshots for square icons...");
  const iconContainer = await page.$('#icon-512');
  
  // 512x512
  await iconContainer.screenshot({
    path: path.join(process.cwd(), 'public', 'icon-512.png'),
    type: 'png',
    omitBackground: true
  });
  
  // For smaller icons, we'll just set viewport and scale using CSS
  const sizes = [192, 64, 32];
  for (const size of sizes) {
    await page.evaluate((s) => {
      const el = document.getElementById('icon-512');
      el.style.width = s + 'px';
      el.style.height = s + 'px';
      el.querySelector('.logo-text').style.transform = \`scale(\${s / 512 * 0.9})\`;
    }, size);
    
    await iconContainer.screenshot({
      path: path.join(process.cwd(), 'public', \`icon-\${size}.png\`),
      type: 'png',
      omitBackground: true
    });
  }
  
  // apple-touch-icon
  await page.evaluate(() => {
    const el = document.getElementById('icon-512');
    el.style.width = '180px';
    el.style.height = '180px';
    el.style.background = '#000000'; // Apple touch icon usually has solid background
    el.querySelector('.logo-text').style.transform = \`scale(\${180 / 512 * 0.8})\`;
  });
  await iconContainer.screenshot({
    path: path.join(process.cwd(), 'public', 'apple-touch-icon.png'),
    type: 'png'
  });
  
  await browser.close();
  
  // Also create a basic SVG for icon.svg and favicon.svg
  const svgContent = \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#48007E" />
      <stop offset="50%" stop-color="#1D2AC4" />
      <stop offset="100%" stop-color="#007DFF" />
    </linearGradient>
  </defs>
  <text x="256" y="240" font-family="Montserrat, system-ui, sans-serif" font-weight="900" font-size="160" fill="url(#grad)" text-anchor="middle" letter-spacing="-6">BLUE</text>
  <text x="256" y="340" font-family="Montserrat, system-ui, sans-serif" font-weight="900" font-size="110" fill="url(#grad)" text-anchor="middle" letter-spacing="-4">cine</text>
</svg>\`;

  await fs.writeFile(path.join(process.cwd(), 'public', 'icon.svg'), svgContent);
  await fs.writeFile(path.join(process.cwd(), 'public', 'favicon.svg'), svgContent);
  
  console.log("Done!");
}

main().catch(console.error);
