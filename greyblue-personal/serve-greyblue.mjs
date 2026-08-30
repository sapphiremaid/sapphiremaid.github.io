import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)))
const entryPath = '/greyblue-archipelago/'
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.glb', 'model/gltf-binary'],
  ['.gltf', 'model/gltf+json'],
  ['.wasm', 'application/wasm']
])

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const relative = normalize(decoded).replace(/^([/\\])+/, '')
  const candidate = resolve(root, relative)
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null
  return candidate
}

async function resolveRequest(urlPath) {
  let path = safePath(urlPath)
  if (!path) return null
  try {
    const info = await stat(path)
    if (info.isDirectory()) path = join(path, 'index.html')
    const fileInfo = await stat(path)
    return fileInfo.isFile() ? path : null
  } catch {
    return null
  }
}

const server = createServer(async (req, res) => {
  const path = await resolveRequest(req.url || '/')
  if (!path) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }

  try {
    const body = await readFile(path)
    res.writeHead(200, {
      'content-type': mime.get(extname(path).toLowerCase()) || 'application/octet-stream',
      'cache-control': 'no-store'
    })
    res.end(body)
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(`Greyblue server error: ${error.message}`)
  }
})

server.listen(0, '127.0.0.1', () => {
  const address = server.address()
  const url = `http://127.0.0.1:${address.port}${entryPath}`
  console.log(url)
  if (process.env.GREYBLUE_NO_OPEN !== '1') {
    execFile('cmd.exe', ['/d', '/s', '/c', 'start', '""', url], { windowsHide: true }, () => {})
  }
})

const shutdown = () => server.close(() => process.exit(0))
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
setTimeout(shutdown, 8 * 60 * 60 * 1000).unref()
