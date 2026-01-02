// Simple Node.js server for serving the built app with SPA routing support
// Usage: node server.js
// This ensures all routes serve index.html for proper SPA routing

import { createServer } from 'https';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;
const distDir = join(__dirname, 'dist');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'application/font-woff',
  '.woff2': 'application/font-woff2',
  '.ttf': 'application/font-ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

const server = createServer((req, res) => {
  let filePath = join(distDir, req.url === '/' ? 'index.html' : req.url);
  const ext = extname(filePath);
  
  // If the file doesn't exist and it's not a file request, serve index.html (SPA routing)
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(distDir, 'index.html');
  }

  // If index.html doesn't exist, return 404
  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const content = readFileSync(filePath);

  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log('Serving files from:', distDir);
});

