// 정적 파일 서버. 가입·진단·상담 신청 같은 데이터는 브라우저가 Supabase 에 직접 보낸다(RLS 로 보호).
// 이 서버가 하는 일: public/ 서빙, /config.js(공개 키 전달), /api/site(푸터 회사 정보), /api/service(서비스 문구).
// DB 비밀번호나 서버 비밀값이 필요 없다.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { SERVICE } = require('./service');
const defaultSupabase = require('./supabase-config.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function createApp({
  publicDir = path.join(__dirname, '..', 'public'),
  site = { companyName: process.env.COMPANY_NAME, contactEmail: process.env.CONTACT_EMAIL, contactPhone: process.env.CONTACT_PHONE },
  // 공개 키(publishable)는 브라우저에 노출되도록 만들어진 값이다. 환경변수로 덮어쓸 수 있다.
  supabase = {
    url: process.env.SUPABASE_URL || defaultSupabase.url,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || defaultSupabase.publishableKey,
  },
} = {}) {
  const root = path.resolve(publicDir);
  const supabaseOrigin = new URL(supabase.url).origin;
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    `connect-src 'self' ${supabaseOrigin}`,
    "img-src 'self' data:",
    "frame-ancestors 'none'",
  ].join('; ');

  const configJs = `window.APP_CONFIG = ${JSON.stringify({ supabaseUrl: supabase.url, supabaseKey: supabase.publishableKey })};\n`;

  function json(res, status, body, cache = 'no-store') {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache });
    res.end(JSON.stringify(body));
  }

  function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed.' });
    let rel;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      return json(res, 400, { error: 'Bad request.' });
    }
    if (rel === '/') rel = '/index.html';
    const file = path.resolve(root, '.' + rel);
    if (file !== root && !file.startsWith(root + path.sep)) return json(res, 403, { error: 'Forbidden.' });
    fs.readFile(file, (err, buf) => {
      if (err) return json(res, 404, { error: 'Not found.' });
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  }

  const server = http.createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', csp);
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && pathname === '/config.js') {
        res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' });
        return res.end(configJs);
      }
      if (req.method === 'GET' && pathname === '/api/site') {
        return json(res, 200, { companyName: site.companyName || '', contactEmail: site.contactEmail || '', contactPhone: site.contactPhone || '' });
      }
      if (req.method === 'GET' && pathname === '/api/service') return json(res, 200, SERVICE);
      if (pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found.' });
      return serveStatic(req, res, pathname);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) json(res, 500, { error: 'Server error.' });
      else res.end();
    }
  });

  return { server };
}

module.exports = { createApp };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const { server } = createApp();
  server.listen(port, '127.0.0.1', () => console.log(`AI Security Check: http://localhost:${port}`));
}
