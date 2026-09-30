// Local dev server: runs the same /api functions Vercel runs, and serves public/.
// Usage: npm run dev   (reads .env). Or use `vercel dev` if you have the Vercel CLI.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

try { process.loadEnvFile(".env"); } catch {} // no .env is fine: runs on demo data

const PORT = process.env.PORT || 3000;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  // Vercel-style helpers
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };

  const m = url.pathname.match(/^\/api\/([a-z-]+)$/);
  if (m && fs.existsSync(`api/${m[1]}.js`)) {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
    const { default: handler } = await import(`./api/${m[1]}.js`);
    return handler(req, res);
  }
  const file = path.join("public", url.pathname === "/" ? "index.html" : path.normalize(url.pathname));
  if (!file.startsWith("public") || !fs.existsSync(file)) { res.statusCode = 404; return res.end("Not found"); }
  res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Coach running on http://localhost:${PORT}`));
