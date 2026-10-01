import { mkdir, copyFile, cp } from 'node:fs/promises';
await mkdir('public', { recursive: true });
await copyFile('index.html', 'public/index.html');
await cp('assets', 'public/assets', { recursive: true });
console.log('Storefront built. API handlers remain in /api.');
