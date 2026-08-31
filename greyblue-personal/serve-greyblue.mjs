import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer, get as httpGet } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
const root = existsSync(join(scriptDir, 'greyblue-archipelago', 'index.html'))
  ? scriptDir
  : resolve(scriptDir, '..')
const entryPath = '/greyblue-archipelago/'
const instancePath = '/__greyblue_instance__'
const instanceId = createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 16)
const preferredPort = 41000 + (Number.parseInt(instanceId.slice(0, 4), 16) % 20000)

if (!existsSync(join(root, 'greyblue-archipelago', 'index.html'))) {
  throw new Error('Greyblue source tree is missing: expected greyblue-archipelago/index.html')
}

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
  let decoded
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0])
  } catch {
    return null
  }
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

function openBrowser(url) {
  if (process.env.GREYBLUE_NO_OPEN === '1') return
  execFile('cmd.exe', ['/d', '/s', '/c', 'start', '""', url], { windowsHide: true }, () => {})
}

function announce(url) {
  console.log(url)
  openBrowser(url)
}

function probeExisting(port) {
  return new Promise((resolveProbe) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolveProbe(value)
    }
    const request = httpGet({ host: '127.0.0.1', port, path: instancePath, timeout: 750 }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        if (body.length < 4096) body += chunk
      })
      response.on('end', () => {
        try {
          const payload = JSON.parse(body)
          finish(response.statusCode === 200 && payload?.service === 'greyblue-personal' && payload?.instanceId === instanceId)
        } catch {
          finish(false)
        }
      })
    })
    request.on('timeout', () => request.destroy())
    request.on('error', () => finish(false))
  })
}

const server = createServer(async (req, res) => {
  const urlPath = req.url || '/'
  if (urlPath.split('?')[0] === instancePath) {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    })
    res.end(JSON.stringify({ service: 'greyblue-personal', instanceId, entryPath }))
    return
  }

  const path = await resolveRequest(urlPath)
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

async function start() {
  if (await probeExisting(preferredPort)) {
    announce(`http://127.0.0.1:${preferredPort}${entryPath}`)
    return
  }

  server.once('error', (error) => {
    if (error?.code === 'EADDRINUSE') {
      server.listen(0, '127.0.0.1')
      return
    }
    console.error(`Greyblue server failed: ${error?.message || error}`)
    process.exitCode = 1
  })
  server.listen(preferredPort, '127.0.0.1', () => {
    const address = server.address()
    announce(`http://127.0.0.1:${address.port}${entryPath}`)
  })
}

await start()

const shutdown = () => server.close(() => process.exit(0))
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
setTimeout(shutdown, 8 * 60 * 60 * 1000).unref()
