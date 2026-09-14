// A small static server for developing the staff pages against common/api.mock.js (?mock=1) before the Worker exists.
// 127.0.0.1 only, on PORT (default 8401, vl2's dev port). Playwright specs never use it: they run against the real Worker.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public')
const PORT = Number(process.env.PORT || 8401)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' }

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  if (url.pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'The dev server has no API. Add ?mock=1.', code: 'not_found' }))
  }
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)))
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end() }
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html')
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    res.end(body)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
  }
}).listen(PORT, '127.0.0.1', () => console.log(`vl2 mock dev server on http://127.0.0.1:${PORT}/staff/?mock=1`))
