import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

let server = null;
let baseUrl = null;

// MP2-STORE's real REST client calls fetch() against a relative path, which
// Chromium rejects outright for file:// pages (before Playwright's own route
// interception ever sees it) - every other scenario in this suite plays
// happily over file://, but the multiplayer lobby's own network calls need a
// genuine http(s) origin to even be attempted, same as the real deployed site.
export function startStaticServer() {
  server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filePath = path.join(PROJECT_ROOT, urlPath === '/' ? '/index.html' : urlPath);
    if (!filePath.startsWith(PROJECT_ROOT)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve(baseUrl);
    });
  });
}

export function stopStaticServer() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  });
}

export function getStaticBaseUrl() {
  return baseUrl;
}
