const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const sourceIcon = path.join(__dirname, '../public/logo.svg');
const outputDir = path.join(__dirname, '../public/icons');

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function generateIcons() {
  console.log('🎨 Generating PWA icons...');
  
  // Check if source icon exists
  if (!fs.existsSync(sourceIcon)) {
    console.error('❌ Source icon not found at:', sourceIcon);
    console.log('💡 Please create a logo.svg file in the public directory');
    console.log('💡 For now, creating placeholder icons...');
    
    // Create placeholder icons
    await generatePlaceholderIcons();
    return;
  }

  try {
    // Generate standard icons
    for (const size of sizes) {
      await sharp(sourceIcon)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(path.join(outputDir, `icon-${size}x${size}.png`));
      
      console.log(`✅ Generated icon-${size}x${size}.png`);
    }
    
    // Generate Apple touch icon (opaque background)
    await sharp(sourceIcon)
      .resize(180, 180, {
        fit: 'contain',
        background: { r: 0, g: 102, b: 204, alpha: 1 } // theme color
      })
      .png()
      .toFile(path.join(outputDir, 'apple-touch-icon.png'));
    
    console.log('✅ Generated apple-touch-icon.png');
    
    // Generate favicon
    await sharp(sourceIcon)
      .resize(32, 32, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(__dirname, '../public/favicon.png'));
    
    console.log('✅ Generated favicon.png');
    
    console.log('🎉 All icons generated successfully!');
  } catch (error) {
    console.error('❌ Error generating icons:', error);
    console.log('💡 Falling back to placeholder icons...');
    await generatePlaceholderIcons();
  }
}

async function generatePlaceholderIcons() {
  const svg = `
    <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" fill="#0066cc"/>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="200" 
            fill="white" text-anchor="middle" dominant-baseline="middle" 
            font-weight="bold">EE</text>
    </svg>
  `;
  
  const buffer = Buffer.from(svg);
  
  for (const size of sizes) {
    await sharp(buffer)
      .resize(size, size)
      .png()
      .toFile(path.join(outputDir, `icon-${size}x${size}.png`));
    
    console.log(`✅ Generated placeholder icon-${size}x${size}.png`);
  }
  
  // Apple touch icon
  await sharp(buffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(outputDir, 'apple-touch-icon.png'));
  
  console.log('✅ Generated placeholder apple-touch-icon.png');
  
  // Favicon
  await sharp(buffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(__dirname, '../public/favicon.png'));
  
  console.log('✅ Generated placeholder favicon.png');
  
  console.log('🎉 Placeholder icons created! Replace logo.svg for custom icons.');
}

// Run the generation
generateIcons().catch(console.error);
