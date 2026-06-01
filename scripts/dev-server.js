const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 4173);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
};

function send(res, status, body, type) {
    res.statusCode = status;
    res.setHeader('Content-Type', type || 'text/plain; charset=utf-8');
    res.end(body);
}

async function handleApi(req, res, pathname, query) {
    const apiName = pathname.replace(/^\/api\//, '').replace(/\.js$/, '');
    const handlerPath = path.join(ROOT, 'api', `${apiName}.js`);
    if (!handlerPath.startsWith(path.join(ROOT, 'api')) || !fs.existsSync(handlerPath)) {
        send(res, 404, JSON.stringify({ success: false, message: 'API not found' }), MIME['.json']);
        return;
    }
    delete require.cache[require.resolve(handlerPath)];
    const handler = require(handlerPath);
    req.query = Object.fromEntries(query.entries());
    await Promise.resolve(handler(req, res));
}

function handleStatic(res, pathname) {
    const requestPath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.normalize(path.join(ROOT, requestPath));
    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        send(res, 404, 'Not found');
        return;
    }
    res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        if (url.pathname.startsWith('/api/')) {
            await handleApi(req, res, url.pathname, url.searchParams);
            return;
        }
        handleStatic(res, url.pathname);
    } catch (error) {
        send(res, 500, JSON.stringify({ success: false, message: error.message }), MIME['.json']);
    }
});

server.listen(PORT, () => {
    console.log(`fund-tracker dev server: http://127.0.0.1:${PORT}`);
});
