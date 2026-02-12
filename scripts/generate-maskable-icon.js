const sharp = require('sharp');
const path = require('path');

const svg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="80" fill="#0B1220"/>
  <text x="50%" y="52%" font-family="Arial,sans-serif" font-size="180"
        fill="white" text-anchor="middle" dominant-baseline="middle"
        font-weight="bold">EE</text>
</svg>`;

sharp(Buffer.from(svg))
  .resize(512, 512)
  .png()
  .toFile(path.join(__dirname, '..', 'public', 'icons', 'maskable-512x512.png'))
  .then(() => console.log('✅ maskable-512x512.png generated'))
  .catch((e) => console.error('❌', e));
