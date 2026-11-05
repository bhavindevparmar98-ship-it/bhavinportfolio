const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

let PORT = parseInt(process.env.PORT, 10) || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp'
};

const clients = new Set();

const LIVE_RELOAD_SCRIPT = `
<!-- Live Reload Script -->
<script>
(function() {
  if (typeof window === 'undefined') return;
  var es = new EventSource('/__live_reload__');
  es.onmessage = function(e) {
    if (e.data === 'reload') {
      console.log('[LiveReload] Change detected, reloading page...');
      window.location.reload();
    }
  };
  es.onerror = function() {
    es.close();
    setTimeout(function() {
      window.location.reload();
    }, 1500);
  };
})();
</script>
`;

let reloadTimeout = null;
function notifyClients() {
  clearTimeout(reloadTimeout);
  reloadTimeout = setTimeout(() => {
    console.log('🔄 File changed, reloading browser...');
    for (const res of clients) {
      try {
        res.write('data: reload\n\n');
      } catch (e) {
        clients.delete(res);
      }
    }
  }, 100);
}

try {
  fs.watch(ROOT, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    if (filename.includes('node_modules') || filename.includes('.git') || filename.endsWith('.log')) return;
    notifyClients();
  });
} catch (err) {
  console.warn('File watcher warning:', err.message);
}

const server = http.createServer((req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    if (pathname === '/__live_reload__') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (pathname === '/' || pathname === '') {
      pathname = '/index.html';
    }

    let filePath = path.normalize(path.join(ROOT, pathname));

    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err) {
        if (fs.existsSync(filePath + '.html')) {
          filePath = filePath + '.html';
        } else {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h1>404 Not Found</h1><p>The requested URL <code>${pathname}</code> was not found.</p>`);
          return;
        }
      } else if (stats.isDirectory()) {
        const indexFile = path.join(filePath, 'index.html');
        if (fs.existsSync(indexFile)) {
          filePath = indexFile;
        } else {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('403 Directory Listing Denied');
          return;
        }
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      if (ext === '.html') {
        fs.readFile(filePath, 'utf8', (readErr, content) => {
          if (readErr) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('500 Error reading file');
            return;
          }
          let modified = content;
          if (modified.includes('</body>')) {
            modified = modified.replace('</body>', `${LIVE_RELOAD_SCRIPT}</body>`);
          } else {
            modified += LIVE_RELOAD_SCRIPT;
          }
          res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*'
          });
          res.end(modified);
        });
      } else {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*'
        });
        fs.createReadStream(filePath).pipe(res);
      }
    });
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 Internal Server Error: ' + error.message);
  }
});

function openBrowser(url) {
  const startCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${startCmd} ${url}`, () => {});
}

function startServer(port) {
  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`\n==================================================`);
    console.log(`  🚀 Live Dev Server is Running!`);
    console.log(`  👉 Local:       ${url}`);
    console.log(`  ⚡ Live Reload: Enabled (auto-updates on change)`);
    console.log(`==================================================\n`);
    openBrowser(url);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} in use, trying port ${PORT + 1}...`);
    PORT += 1;
    startServer(PORT);
  } else {
    console.error('Server error:', err);
  }
});

startServer(PORT);

