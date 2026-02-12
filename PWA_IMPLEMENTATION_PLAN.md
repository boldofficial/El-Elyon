# PWA Implementation Plan - El-Elyon

**Created:** February 5, 2026  
**Status:** Planning  
**Total Estimated Time:** 48 hours  
**Priority:** High (enhances user experience, offline capability)

---

## Overview

Transform El-Elyon into a Progressive Web App (PWA) with offline-first capabilities, installability, push notifications, and app-like experience for healthcare workers on mobile and desktop devices.

### PWA Benefits for Healthcare Workers

- **Offline Access**: View resident information, schedules, and logs without internet
- **Installability**: Add to home screen, full-screen app experience
- **Fast Performance**: Instant loading with service worker caching
- **Push Notifications**: Real-time alerts for memos, shift reminders, compliance alerts
- **Background Sync**: Submit forms while offline, auto-sync when online
- **Reliable**: Works in low/no connectivity environments (rural facilities)
- **App-Like Experience**: Native-like interactions, no browser chrome

---

## Phase 1: Foundation & Manifest (8 hours)

### Tasks

#### 1.1 Web App Manifest (2 hours)

**File:** `public/manifest.json`

Create comprehensive manifest for installability:

```json
{
  "name": "El-Elyon Healthcare Management",
  "short_name": "El-Elyon",
  "description": "Healthcare management system for residential care facilities",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0066cc",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icons/icon-72x72.png",
      "sizes": "72x72",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icons/icon-96x96.png",
      "sizes": "96x96",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icons/icon-128x128.png",
      "sizes": "128x128",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icons/icon-144x144.png",
      "sizes": "144x144",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icons/icon-152x152.png",
      "sizes": "152x152",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icons/icon-384x384.png",
      "sizes": "384x384",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable any"
    }
  ],
  "screenshots": [
    {
      "src": "/screenshots/desktop-home.png",
      "sizes": "1280x720",
      "type": "image/png",
      "form_factor": "wide"
    },
    {
      "src": "/screenshots/mobile-home.png",
      "sizes": "750x1334",
      "type": "image/png",
      "form_factor": "narrow"
    }
  ],
  "categories": ["health", "medical", "productivity"],
  "shortcuts": [
    {
      "name": "Clock In",
      "short_name": "Clock In",
      "description": "Start your shift",
      "url": "/kiosk?action=clock-in",
      "icons": [{ "src": "/icons/clock-in.png", "sizes": "96x96" }]
    },
    {
      "name": "View Residents",
      "short_name": "Residents",
      "description": "Access resident information",
      "url": "/care",
      "icons": [{ "src": "/icons/residents.png", "sizes": "96x96" }]
    },
    {
      "name": "Memos",
      "short_name": "Memos",
      "description": "View memos and updates",
      "url": "/memos",
      "icons": [{ "src": "/icons/memos.png", "sizes": "96x96" }]
    }
  ],
  "prefer_related_applications": false
}
```

**Validation:**
- Icons: All sizes (72x72 to 512x512) with maskable support
- Screenshots: Desktop (wide) and mobile (narrow) form factors
- Shortcuts: Quick access to key features
- Categories: Proper Play Store/App Store categorization

#### 1.2 App Icons Generation (1 hour)

**Tools:** Use Sharp or online tool (realfavicongenerator.net)

Generate all required icon sizes:
- 72x72, 96x96, 128x128, 144x144, 152x152, 192x192, 384x384, 512x512
- Maskable icons (safe zone for different mask shapes)
- Apple touch icons (180x180)
- Favicon (16x16, 32x32)

**Directory:** `public/icons/`

**Script:** `scripts/generate-icons.js`
```javascript
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const sourceIcon = path.join(__dirname, '../public/logo.svg');
const outputDir = path.join(__dirname, '../public/icons');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function generateIcons() {
  for (const size of sizes) {
    await sharp(sourceIcon)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(outputDir, `icon-${size}x${size}.png`));
    console.log(`Generated icon-${size}x${size}.png`);
  }
  
  // Apple touch icon
  await sharp(sourceIcon)
    .resize(180, 180, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toFile(path.join(outputDir, 'apple-touch-icon.png'));
  console.log('Generated apple-touch-icon.png');
}

generateIcons().catch(console.error);
```

#### 1.3 Update HTML Meta Tags (1 hour)

**File:** `src/app/layout.tsx`

Add PWA meta tags:

```tsx
export const metadata: Metadata = {
  // ... existing metadata
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'El-Elyon',
  },
  formatDetection: {
    telephone: false,
  },
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0066cc' },
    { media: '(prefers-color-scheme: dark)', color: '#0052a3' }
  ],
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};
```

Add head elements:
```tsx
<head>
  <link rel="manifest" href="/manifest.json" />
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="El-Elyon" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="theme-color" content="#0066cc" />
</head>
```

#### 1.4 Next.js PWA Plugin Setup (2 hours)

**Package:** `next-pwa`

Install:
```bash
npm install next-pwa
```

**File:** `next.config.ts`

```typescript
import withPWA from 'next-pwa';

const pwaConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    // Will be customized in Phase 2
  ],
  buildExcludes: [/middleware-manifest\.json$/],
  publicExcludes: ['!robots.txt', '!sitemap.xml'],
});

const nextConfig = {
  // ... existing config
};

export default pwaConfig(nextConfig);
```

#### 1.5 Basic Service Worker Registration (2 hours)

**File:** `public/sw.js` (generated by next-pwa, but custom logic needed)

**File:** `lib/pwa/register-sw.ts`

```typescript
'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';

export function useServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          logger.info('[PWA] Service Worker registered:', registration.scope);
          
          // Check for updates every hour
          setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000);
          
          // Listen for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New service worker available
                  if (window.confirm('New version available! Reload to update?')) {
                    window.location.reload();
                  }
                }
              });
            }
          });
        })
        .catch((error) => {
          logger.error('[PWA] Service Worker registration failed:', error);
        });
    }
  }, []);
}
```

**Usage in:** `src/app/layout.tsx`

```tsx
'use client';

import { useServiceWorker } from '@/lib/pwa/register-sw';

export default function RootLayout({ children }) {
  useServiceWorker();
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
```

---

## Phase 2: Offline Functionality & Caching (16 hours)

### Caching Strategy

Healthcare app requires careful caching for offline functionality while ensuring data freshness.

#### 2.1 Cache Strategy Design (2 hours)

**Cache Types:**

1. **App Shell (Cache First)**
   - HTML, CSS, JavaScript bundles
   - Static assets (fonts, icons)
   - Versioned, updated on new deployment

2. **API Data (Network First with Fallback)**
   - Resident information
   - Employee schedules
   - Memos
   - Fresh data preferred, fallback to cache if offline

3. **User-Generated Content (Network Only with Background Sync)**
   - Clock in/out
   - Care logs
   - Form submissions
   - Must sync to server, queue if offline

4. **Static Content (Cache First with Refresh)**
   - Images from S3
   - PDFs, documents
   - Cached indefinitely, updated in background

#### 2.2 Runtime Caching Configuration (4 hours)

**File:** `next.config.ts` (update PWA config)

```typescript
const pwaConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    // App Shell - Cache First
    {
      urlPattern: /^https?.*\.(js|css|woff|woff2|ttf|otf)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'app-shell',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
        },
      },
    },
    
    // Static Images - Cache First
    {
      urlPattern: /^https?.*\.(png|jpg|jpeg|gif|svg|webp|ico)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-images',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
      },
    },
    
    // API Routes - Network First
    {
      urlPattern: /^https?:\/\/.*\/api\/(residents|employees|shifts|memos|care)/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 5 * 60, // 5 minutes
        },
        networkTimeoutSeconds: 10,
      },
    },
    
    // Auth Routes - Network Only
    {
      urlPattern: /^https?:\/\/.*\/api\/(auth|users\/current)/,
      handler: 'NetworkOnly',
    },
    
    // S3 Assets - Cache First with Refresh
    {
      urlPattern: /^https?:\/\/.*\.s3\.amazonaws\.com\/.*/,
      handler: 'CacheFirst',
      options: {
        cacheName: 's3-assets',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    
    // HTML Pages - Network First
    {
      urlPattern: /^https?:\/\/.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages-cache',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        },
      },
    },
  ],
});
```

#### 2.3 Offline Page (2 hours)

**File:** `public/offline.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline - El-Elyon</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    h1 { font-size: 2.5rem; margin-bottom: 1rem; }
    p { font-size: 1.2rem; margin-bottom: 2rem; }
    .icon { font-size: 5rem; margin-bottom: 2rem; }
    button {
      background: white;
      color: #667eea;
      border: none;
      padding: 1rem 2rem;
      font-size: 1rem;
      border-radius: 0.5rem;
      cursor: pointer;
      font-weight: 600;
    }
    button:hover { background: #f0f0f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">📡</div>
    <h1>You're Offline</h1>
    <p>El-Elyon requires an internet connection for this page.</p>
    <p>Some features may still be available from cached data.</p>
    <button onclick="window.location.reload()">Try Again</button>
  </div>
</body>
</html>
```

#### 2.4 Offline Indicator Component (2 hours)

**File:** `components/shared/OfflineIndicator.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowNotification(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial state
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!showNotification && isOnline) return null;

  return (
    <div
      className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg transition-all ${
        isOnline
          ? 'bg-green-500 text-white'
          : 'bg-red-500 text-white'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi className="w-5 h-5" />
          <span>Back Online</span>
        </>
      ) : (
        <>
          <WifiOff className="w-5 h-5" />
          <span>Offline Mode</span>
        </>
      )}
    </div>
  );
}
```

Add to layout:
```tsx
import { OfflineIndicator } from '@/components/shared/OfflineIndicator';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <OfflineIndicator />
        {children}
      </body>
    </html>
  );
}
```

#### 2.5 Cache Management Utilities (3 hours)

**File:** `lib/pwa/cache-manager.ts`

```typescript
export class CacheManager {
  static async clearOldCaches(currentVersion: string) {
    const cacheNames = await caches.keys();
    const oldCaches = cacheNames.filter(name => !name.includes(currentVersion));
    
    await Promise.all(
      oldCaches.map(cacheName => caches.delete(cacheName))
    );
  }

  static async getCacheSize() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
        percentage: ((estimate.usage || 0) / (estimate.quota || 1)) * 100,
      };
    }
    return null;
  }

  static async clearAllCaches() {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
  }

  static async preloadCriticalResources(urls: string[]) {
    const cache = await caches.open('critical-resources');
    await cache.addAll(urls);
  }
}
```

**File:** `components/admin/CacheSettings.tsx`

Admin panel for cache management:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { CacheManager } from '@/lib/pwa/cache-manager';
import { Trash2, Database } from 'lucide-react';

export function CacheSettings() {
  const [cacheSize, setCacheSize] = useState<{
    usage: number;
    quota: number;
    percentage: number;
  } | null>(null);

  useEffect(() => {
    loadCacheSize();
  }, []);

  const loadCacheSize = async () => {
    const size = await CacheManager.getCacheSize();
    setCacheSize(size);
  };

  const handleClearCache = async () => {
    if (confirm('Clear all cached data? This will require re-downloading resources.')) {
      await CacheManager.clearAllCaches();
      await loadCacheSize();
      window.location.reload();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <Database className="w-5 h-5" />
        PWA Cache Settings
      </h2>

      {cacheSize && (
        <div className="mb-6">
          <div className="flex justify-between mb-2">
            <span>Cache Usage:</span>
            <span className="font-mono">
              {(cacheSize.usage / 1024 / 1024).toFixed(2)} MB / 
              {(cacheSize.quota / 1024 / 1024).toFixed(2)} MB
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${Math.min(cacheSize.percentage, 100)}%` }}
            />
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {cacheSize.percentage.toFixed(1)}% of storage quota used
          </p>
        </div>
      )}

      <button
        onClick={handleClearCache}
        className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
      >
        <Trash2 className="w-4 h-4" />
        Clear All Cache
      </button>
    </div>
  );
}
```

#### 2.6 Offline Data Sync Queue (3 hours)

**File:** `lib/pwa/sync-queue.ts`

```typescript
import { logger } from '@/lib/logger';

interface QueueItem {
  id: string;
  url: string;
  method: string;
  body: any;
  headers: Record<string, string>;
  timestamp: number;
  retries: number;
}

export class SyncQueue {
  private static QUEUE_KEY = 'sync-queue';
  private static MAX_RETRIES = 3;

  static async add(request: Request): Promise<void> {
    const queue = await this.getQueue();
    const item: QueueItem = {
      id: crypto.randomUUID(),
      url: request.url,
      method: request.method,
      body: await request.clone().json().catch(() => null),
      headers: Object.fromEntries(request.headers.entries()),
      timestamp: Date.now(),
      retries: 0,
    };
    
    queue.push(item);
    await this.saveQueue(queue);
    logger.info('[SyncQueue] Added to queue:', item.id);
  }

  static async process(): Promise<void> {
    if (!navigator.onLine) return;

    const queue = await this.getQueue();
    const processed: string[] = [];

    for (const item of queue) {
      try {
        const response = await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body ? JSON.stringify(item.body) : undefined,
        });

        if (response.ok) {
          processed.push(item.id);
          logger.info('[SyncQueue] Synced:', item.id);
        } else if (item.retries >= this.MAX_RETRIES) {
          processed.push(item.id);
          logger.error('[SyncQueue] Max retries reached:', item.id);
        } else {
          item.retries++;
        }
      } catch (error) {
        logger.error('[SyncQueue] Sync failed:', item.id, error);
        if (item.retries >= this.MAX_RETRIES) {
          processed.push(item.id);
        } else {
          item.retries++;
        }
      }
    }

    const remaining = queue.filter(item => !processed.includes(item.id));
    await this.saveQueue(remaining);
  }

  static async getQueue(): Promise<QueueItem[]> {
    const data = localStorage.getItem(this.QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  }

  static async saveQueue(queue: QueueItem[]): Promise<void> {
    localStorage.setItem(this.QUEUE_KEY, JSON.stringify(queue));
  }

  static async getPendingCount(): Promise<number> {
    const queue = await this.getQueue();
    return queue.length;
  }

  static async clear(): Promise<void> {
    localStorage.removeItem(this.QUEUE_KEY);
  }
}

// Auto-process queue when coming online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    SyncQueue.process();
  });
}
```

---

## Phase 3: Advanced PWA Features (16 hours)

### 3.1 Push Notifications Setup (6 hours)

#### 3.1.1 Web Push Service Setup

**Package:** `web-push`

```bash
npm install web-push
```

Generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```

Add to environment variables:
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=admin@el-elyon.com
```

#### 3.1.2 Push Subscription API

**File:** `src/app/api/push/subscribe/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { pushSubscriptions } from '@/db/schema';

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const subscription = await req.json();

    // Save subscription to database
    await db.insert(pushSubscriptions).values({
      clerkUserId: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[Push] Subscription failed:', error);
    return NextResponse.json({ error: 'Subscription failed' }, { status: 500 });
  }
}
```

**File:** `src/app/api/push/send/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { db } from '@/db';
import { pushSubscriptions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const { userId, title, body, url, badge } = await req.json();

    // Get user's subscriptions
    const subscriptions = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.clerkUserId, userId));

    const payload = JSON.stringify({
      title,
      body,
      icon: '/icons/icon-192x192.png',
      badge: badge || '/icons/badge-72x72.png',
      url: url || '/',
      tag: 'el-elyon-notification',
      requireInteraction: false,
    });

    // Send to all user's devices
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            payload
          );
        } catch (error: any) {
          // Remove expired subscriptions
          if (error.statusCode === 410) {
            await db
              .delete(pushSubscriptions)
              .where(eq(pushSubscriptions.id, sub.id));
          }
        }
      })
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[Push] Send failed:', error);
    return NextResponse.json({ error: 'Send failed' }, { status: 500 });
  }
}
```

#### 3.1.3 Push Notification Manager

**File:** `lib/pwa/push-manager.ts`

```typescript
export class PushManager {
  static async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      throw new Error('Notifications not supported');
    }
    return await Notification.requestPermission();
  }

  static async subscribe(): Promise<PushSubscription | null> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return null;
    }

    const registration = await navigator.serviceWorker.ready;
    
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: this.urlBase64ToUint8Array(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
      ),
    });

    // Send subscription to server
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });

    return subscription;
  }

  static async unsubscribe(): Promise<void> {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      await subscription.unsubscribe();
      // Optionally notify server to remove subscription
    }
  }

  static async getSubscription(): Promise<PushSubscription | null> {
    if (!('serviceWorker' in navigator)) return null;
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  }

  private static urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');
    const rawData = window.atob(base64);
    return new Uint8Array([...rawData].map(char => char.charCodeAt(0)));
  }
}
```

#### 3.1.4 Notification Settings Component

**File:** `components/shared/NotificationSettings.tsx`

```tsx
'use client';

import { useState, useEffect } from 'react';
import { PushManager } from '@/lib/pwa/push-manager';
import { Bell, BellOff } from 'lucide-react';

export function NotificationSettings() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
      const subscription = await PushManager.getSubscription();
      setIsSubscribed(!!subscription);
    }
  };

  const handleEnableNotifications = async () => {
    try {
      const perm = await PushManager.requestPermission();
      setPermission(perm);
      
      if (perm === 'granted') {
        await PushManager.subscribe();
        setIsSubscribed(true);
      }
    } catch (error) {
      console.error('Notification setup failed:', error);
    }
  };

  const handleDisableNotifications = async () => {
    await PushManager.unsubscribe();
    setIsSubscribed(false);
  };

  if (permission === 'denied') {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          Notifications are blocked. Please enable them in your browser settings.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Push Notifications</h3>
      
      {isSubscribed ? (
        <button
          onClick={handleDisableNotifications}
          className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
        >
          <BellOff className="w-4 h-4" />
          Disable Notifications
        </button>
      ) : (
        <button
          onClick={handleEnableNotifications}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          <Bell className="w-4 h-4" />
          Enable Notifications
        </button>
      )}

      <p className="text-sm text-gray-600 mt-4">
        Get notified about new memos, shift reminders, and important alerts.
      </p>
    </div>
  );
}
```

#### 3.1.5 Database Schema for Push Subscriptions

**File:** `db/schema.ts` (add table)

```typescript
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: varchar('clerk_user_id', { length: 255 }).notNull(),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

### 3.2 Background Sync (4 hours)

#### 3.2.1 Background Sync API

**File:** `lib/pwa/background-sync.ts`

```typescript
export class BackgroundSync {
  static async register(tag: string): Promise<void> {
    if (!('serviceWorker' in navigator) || !('sync' in ServiceWorkerRegistration.prototype)) {
      console.warn('Background Sync not supported');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register(tag);
      logger.info('[BackgroundSync] Registered:', tag);
    } catch (error) {
      logger.error('[BackgroundSync] Registration failed:', error);
    }
  }

  static async queueRequest(url: string, options: RequestInit): Promise<void> {
    // Add to sync queue
    await SyncQueue.add(new Request(url, options));
    
    // Register background sync
    await this.register('sync-queue');
  }
}
```

#### 3.2.2 Service Worker Sync Handler

**File:** `public/sw-custom.js` (loaded by service worker)

```javascript
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-queue') {
    event.waitUntil(syncQueue());
  }
});

async function syncQueue() {
  const queue = await getSyncQueue();
  
  for (const item of queue) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body ? JSON.stringify(item.body) : undefined,
      });

      if (response.ok) {
        await removeFromQueue(item.id);
        
        // Show notification on success
        self.registration.showNotification('Synced', {
          body: 'Your data has been synchronized.',
          icon: '/icons/icon-192x192.png',
        });
      }
    } catch (error) {
      console.error('Sync failed:', item.id, error);
    }
  }
}
```

### 3.3 App Install Prompt (3 hours)

**File:** `components/shared/InstallPrompt.tsx`

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      
      // Show prompt after 30 seconds or on next visit
      const hasSeenPrompt = localStorage.getItem('install-prompt-seen');
      if (!hasSeenPrompt) {
        setTimeout(() => setShowPrompt(true), 30000);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowPrompt(false);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      logger.info('[PWA] User accepted install');
    }

    setDeferredPrompt(null);
    setShowPrompt(false);
    localStorage.setItem('install-prompt-seen', 'true');
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('install-prompt-seen', 'true');
  };

  if (!showPrompt || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white rounded-lg shadow-2xl border border-gray-200 p-4 z-50 animate-slide-up">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
          <Download className="w-6 h-6 text-white" />
        </div>
        
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 mb-1">
            Install El-Elyon App
          </h3>
          <p className="text-sm text-gray-600 mb-3">
            Get quick access and offline functionality. Install our app for the best experience.
          </p>
          
          <div className="flex gap-2">
            <button
              onClick={handleInstall}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm font-medium"
            >
              Install
            </button>
            <button
              onClick={handleDismiss}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm"
            >
              Not Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 3.4 App Update Notification (3 hours)

**File:** `components/shared/UpdateNotification.tsx`

```tsx
'use client';

import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

export function UpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        setRegistration(reg);

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setShowUpdate(true);
              }
            });
          }
        });
      });
    }
  }, []);

  const handleUpdate = () => {
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  };

  if (!showUpdate) return null;

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white rounded-lg shadow-lg p-4 z-50 max-w-md">
      <div className="flex items-center gap-3">
        <RefreshCw className="w-5 h-5" />
        <div className="flex-1">
          <p className="font-medium">Update Available</p>
          <p className="text-sm opacity-90">A new version is ready to install.</p>
        </div>
        <button
          onClick={handleUpdate}
          className="px-4 py-2 bg-white text-blue-500 rounded hover:bg-gray-100 font-medium"
        >
          Update Now
        </button>
      </div>
    </div>
  );
}
```

---

## Phase 4: Testing & Optimization (8 hours)

### 4.1 Lighthouse PWA Audit (2 hours)

**Requirements:**
- ✅ Installable (manifest.json)
- ✅ Service worker registered
- ✅ HTTPS (Vercel automatic)
- ✅ Responsive design
- ✅ Fast load times (<3s)
- ✅ Splash screen (manifest icons)
- ✅ Themed address bar (theme_color)
- ✅ Viewport meta tag

**Testing:**
```bash
# Run Lighthouse in Chrome DevTools
# Or use CLI
npm install -g lighthouse
lighthouse https://your-domain.com --view --preset=pwa
```

**Target Scores:**
- Performance: >90
- Accessibility: >90
- Best Practices: >90
- SEO: >90
- PWA: 100

### 4.2 Offline Testing (2 hours)

**Test Scenarios:**

1. **Full Offline**
   - Turn off network
   - Navigate to cached pages
   - Try form submissions (should queue)
   - Verify offline indicator shows

2. **Intermittent Connection**
   - Throttle network to Slow 3G
   - Test API request fallbacks
   - Verify loading states

3. **Background Sync**
   - Submit form while offline
   - Go online
   - Verify sync completes
   - Check notification

4. **Cache Freshness**
   - Load page online
   - Go offline
   - Load cached page
   - Verify data is recent

**Tools:**
- Chrome DevTools > Network > Offline
- Application > Service Workers > Offline
- Lighthouse > Mobile simulation

### 4.3 Cross-Platform Testing (2 hours)

**Platforms:**
- ✅ Chrome Desktop (Windows, Mac, Linux)
- ✅ Chrome Mobile (Android)
- ✅ Safari Desktop (Mac)
- ✅ Safari Mobile (iOS)
- ✅ Edge Desktop (Windows)
- ✅ Firefox Desktop

**Test Features:**
- Install prompt (Android Chrome)
- Add to Home Screen (iOS Safari)
- Push notifications (Android Chrome, Windows Edge)
- Offline functionality
- Background sync
- Cache management

### 4.4 Performance Optimization (2 hours)

**Optimizations:**

1. **Reduce Bundle Size**
   - Code splitting for PWA features
   - Lazy load service worker registration
   - Tree-shake unused code

2. **Optimize Cache Strategy**
   - Precache only critical resources
   - Use stale-while-revalidate for API data
   - Set appropriate cache expiration

3. **Minimize Service Worker Size**
   - Keep service worker < 50KB
   - Avoid large libraries in SW
   - Use Workbox for optimization

4. **Optimize Images**
   - Use WebP format for icons
   - Compress PNG icons
   - Provide multiple sizes

---

## Implementation Timeline

### Week 1: Foundation
- Days 1-2: Phase 1 (Manifest, icons, meta tags, basic SW)
- Days 3-5: Phase 2 (Caching strategies, offline support)

### Week 2: Advanced Features
- Days 1-3: Phase 3.1-3.2 (Push notifications, background sync)
- Days 4-5: Phase 3.3-3.4 (Install prompt, update notifications)

### Week 3: Testing & Launch
- Days 1-2: Phase 4 (Testing, optimization)
- Day 3: Documentation and training
- Days 4-5: Production deployment and monitoring

---

## Testing Checklist

### Functional Testing

- [ ] App installs on Android (Chrome)
- [ ] App installs on iOS (Safari - Add to Home Screen)
- [ ] Service worker registers successfully
- [ ] Offline pages load from cache
- [ ] Offline indicator shows when disconnected
- [ ] API requests fallback to cache when offline
- [ ] Form submissions queue when offline
- [ ] Queued requests sync when online
- [ ] Push notifications received
- [ ] Push notification permission prompt works
- [ ] Update notification appears for new versions
- [ ] Install prompt appears for new users
- [ ] Cache management UI works
- [ ] Splash screen displays on launch

### Performance Testing

- [ ] Lighthouse PWA score: 100
- [ ] Lighthouse Performance score: >90
- [ ] First Contentful Paint: <2s
- [ ] Time to Interactive: <3s
- [ ] Cache size reasonable (<50MB)
- [ ] Service worker size <50KB

### Security Testing

- [ ] HTTPS enforced
- [ ] Service worker only loads on HTTPS
- [ ] Push notifications use VAPID
- [ ] Cached sensitive data encrypted
- [ ] Cache cleared on logout
- [ ] No credentials in service worker

---

## Dependencies

### NPM Packages

```json
{
  "dependencies": {
    "next-pwa": "^5.6.0",
    "web-push": "^3.6.6",
    "workbox-window": "^7.0.0"
  },
  "devDependencies": {
    "sharp": "^0.33.0"
  }
}
```

### Browser Support

- Chrome 90+
- Safari 15.4+ (limited push notifications)
- Firefox 88+
- Edge 90+
- Samsung Internet 15+

---

## Documentation

### User Documentation

**File:** `docs/PWA_USER_GUIDE.md`

Content:
- How to install the app
- How to enable notifications
- How to use offline features
- How to update the app
- Troubleshooting

### Developer Documentation

**File:** `docs/PWA_DEVELOPER_GUIDE.md`

Content:
- Architecture overview
- Caching strategies
- Service worker lifecycle
- Push notification setup
- Background sync implementation
- Testing procedures

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] Generate all app icons (72x72 to 512x512)
- [ ] Create manifest.json with correct URLs
- [ ] Generate VAPID keys for push notifications
- [ ] Set environment variables (VAPID keys)
- [ ] Test on staging environment
- [ ] Run Lighthouse audit (PWA score 100)
- [ ] Test install on Android and iOS
- [ ] Verify HTTPS certificate
- [ ] Test offline functionality
- [ ] Verify push notifications work

### Environment Variables

```
# Push Notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=admin@el-elyon.com
```

### Monitoring

- Monitor service worker registration errors (Sentry)
- Track PWA install rate (analytics)
- Monitor push notification delivery rate
- Track offline usage (analytics)
- Monitor cache size and performance

---

## Success Metrics

### Adoption
- **Install Rate**: >30% of mobile users install PWA
- **Retention**: >60% return after installing

### Performance
- **Lighthouse PWA Score**: 100
- **Load Time**: <2s on 3G connection
- **Offline Success Rate**: >95% for cached pages

### Engagement
- **Push Notification Opt-in**: >40% of users
- **Push Notification Click-Through**: >20%
- **Offline Usage**: >10% of sessions

---

## Future Enhancements

- **Share Target API**: Share content to El-Elyon from other apps
- **Periodic Background Sync**: Auto-refresh data in background
- **Badge API**: Show unread count on app icon
- **Contact Picker**: Quick access to contacts for guardians
- **File System Access**: Direct file saving/loading
- **Web Authentication**: Biometric login
- **Picture-in-Picture**: Video calls with residents

---

## Rollback Plan

If PWA causes issues in production:

1. Disable service worker registration:
   ```typescript
   // In next.config.ts
   disable: true
   ```

2. Unregister existing service workers:
   ```javascript
   if ('serviceWorker' in navigator) {
     navigator.serviceWorker.getRegistrations().then(registrations => {
       registrations.forEach(registration => registration.unregister());
     });
   }
   ```

3. Clear caches:
   ```javascript
   caches.keys().then(names => {
     names.forEach(name => caches.delete(name));
   });
   ```

4. Deploy without PWA features
5. Monitor for issues
6. Re-enable gradually with fixes

---

**Status:** Ready for Implementation  
**Next Step:** Begin Phase 1 - Foundation & Manifest  
**Estimated Completion:** 3 weeks
