import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SOURCE = join(ROOT, 'public', 'logo-source.png');
const ICONS_DIR = join(ROOT, 'public', 'icons');

mkdirSync(ICONS_DIR, { recursive: true });

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function generate() {
  console.log('Generating PWA icons from logo-source.png...\n');

  // Step 1: Trim transparent whitespace from source
  const trimmed = await sharp(SOURCE).trim().toBuffer();
  const trimMeta = await sharp(trimmed).metadata();
  console.log(`  Trimmed to ${trimMeta.width}x${trimMeta.height}\n`);

  // Generate standard icons — logo fills ~85% of the icon with small padding
  for (const size of sizes) {
    const logoSize = Math.round(size * 0.85);
    const pad = Math.round((size - logoSize) / 2);
    const outPath = join(ICONS_DIR, `icon-${size}x${size}.png`);
    
    await sharp(trimmed)
      .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({
        top: pad, bottom: size - logoSize - pad,
        left: pad, right: size - logoSize - pad,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(outPath);
    console.log(`  ✅ icon-${size}x${size}.png`);
  }

  // Maskable icon — logo fills ~70% with solid background (Android safe zone is 80%)
  const maskableLogoSize = Math.round(512 * 0.70);
  const maskablePad = Math.round((512 - maskableLogoSize) / 2);
  await sharp(trimmed)
    .resize(maskableLogoSize, maskableLogoSize, { fit: 'contain', background: { r: 11, g: 18, b: 32, alpha: 1 } })
    .extend({
      top: maskablePad, bottom: 512 - maskableLogoSize - maskablePad,
      left: maskablePad, right: 512 - maskableLogoSize - maskablePad,
      background: { r: 11, g: 18, b: 32, alpha: 1 }
    })
    .png()
    .toFile(join(ICONS_DIR, 'maskable-512x512.png'));
  console.log('  ✅ maskable-512x512.png');

  // Apple touch icon 180x180
  const appleLogoSize = Math.round(180 * 0.85);
  const applePad = Math.round((180 - appleLogoSize) / 2);
  await sharp(trimmed)
    .resize(appleLogoSize, appleLogoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: applePad, bottom: 180 - appleLogoSize - applePad,
      left: applePad, right: 180 - appleLogoSize - applePad,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(join(ICONS_DIR, 'apple-touch-icon.png'));
  console.log('  ✅ apple-touch-icon.png');

  // Favicon 32x32 — logo fills nearly all the space
  await sharp(trimmed)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(ROOT, 'public', 'favicon.png'));
  console.log('  ✅ favicon.png');

  await sharp(trimmed)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(ROOT, 'public', 'favicon.ico'));
  console.log('  ✅ favicon.ico');

  console.log('\n🎉 All icons generated!');
}

generate().catch(console.error);
