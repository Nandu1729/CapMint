const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const PUBLIC_DIR = path.join(__dirname, '..', 'frontend');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml'
};

const proxyApi = (targetPort, req, res) => {
  const options = {
    hostname: '127.0.0.1',
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: req.headers
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(`Bad Gateway: ${err.message}`);
  });

  req.pipe(proxyReq, { end: true });
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // Proxy API requests to backend microservices
  if (urlPath.startsWith('/api/v1/auth')) {
    return proxyApi(8081, req, res);
  } else if (urlPath.startsWith('/api/v1/budgets') || urlPath.startsWith('/api/v1/certifiers')) {
    return proxyApi(8082, req, res);
  } else if (urlPath.startsWith('/api/v1/qr') || urlPath.startsWith('/api/v1/mint') || urlPath.startsWith('/api/v1/gs1')) {
    return proxyApi(8083, req, res);
  } else if (urlPath.startsWith('/01/')) {
    return proxyApi(8084, req, res);
  } else if (urlPath.startsWith('/log') || urlPath.startsWith('/api/v1/log')) {
    return proxyApi(8085, req, res);
  } else if (urlPath.startsWith('/api/v1/verify') || urlPath.startsWith('/api/v1/revocation') || urlPath.startsWith('/api/v1/lots')) {
    return proxyApi(8086, req, res);
  } else if (urlPath.startsWith('/api/v1/integrations')) {
    return proxyApi(8087, req, res);
  }

  let filePath;

  if (urlPath.startsWith('/playground/')) {
    filePath = path.join(__dirname, '..', urlPath);
  } else if (urlPath.startsWith('/api/')) {
    filePath = path.join(__dirname, '..', urlPath);
  } else if (urlPath.startsWith('/verify/')) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  } else {
    filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  }

  // Security: prevent path traversal. The resolved file must stay within an allowed root;
  // otherwise a request like `/api/../.env` or `/../package.json` could read arbitrary files.
  const resolvedPath = path.resolve(filePath);
  const allowedRoots = [
    PUBLIC_DIR,
    path.join(__dirname, '..', 'playground'),
    path.join(__dirname, '..', 'api')
  ];
  const withinAllowedRoot = allowedRoots.some(
    (root) => resolvedPath === root || resolvedPath.startsWith(root + path.sep)
  );
  if (!withinAllowedRoot) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        // Fallback to index.html for SPA routing on other 404s
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err, indexContent) => {
          if (err) {
            res.writeHead(500);
            res.end('Error loading index.html');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(indexContent, 'utf-8');
          }
        });
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend server running on http://localhost:${PORT}`);
});
