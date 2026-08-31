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
const portBase = 41000
const portSpan = 20000
const portStep = 7919
const candidateCount = 16
const preferredOffset = Number.parseInt(instanceId.slice(0, 4), 16) % portSpan
const candidatePorts = Array.from(
  { length: candidateCount },
  (_, index) => portBase + ((preferredOffset + (index * portStep)) % portSpan)
)

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
    let response = null
    let deadline = null
    const finish = (value) => {
      if (settled) return
      settled = true
      if (deadline) clearTimeout(deadline)
      resolveProbe(value)
    }
    const request = httpGet({ host: '127.0.0.1', port, path: instancePath, timeout: 750 }, (incoming) => {
      response = incoming
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
      response.on('error', () => finish(false))
    })
    deadline = setTimeout(() => {
      response?.destroy()
      request.destroy()
      finish(false)
    }, 1000)
    deadline.unref()
    request.on('timeout', () => {
      request.destroy()
      finish(false)
    })
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

function listenOn(port) {
  return new Promise((resolveListen, rejectListen) => {
    const cleanup = () => {
      server.off('listening', onListening)
      server.off('error', onError)
    }
    const onListening = () => {
      cleanup()
      resolveListen(true)
    }
    const onError = (error) => {
      cleanup()
      if (error?.code === 'EADDRINUSE') {
        resolveListen(false)
        return
      }
      rejectListen(error)
    }
    server.once('listening', onListening)
    server.once('error', onError)
    server.listen(port, '127.0.0.1')
  })
}

async function findExisting() {
  const probes = await Promise.all(candidatePorts.map(async (port) => (
    await probeExisting(port) ? port : null
  )))
  return probes.find((port) => port !== null) ?? null
}

async function start() {
  const existingPort = await findExisting()
  if (existingPort !== null) {
    announce(`http://127.0.0.1:${existingPort}${entryPath}`)
    return
  }

  for (const port of candidatePorts) {
    if (await listenOn(port)) {
      announce(`http://127.0.0.1:${port}${entryPath}`)
      return
    }
    if (await probeExisting(port)) {
      announce(`http://127.0.0.1:${port}${entryPath}`)
      return
    }
  }

  throw new Error(`Greyblue could not reserve one of ${candidatePorts.length} stable loopback ports`)
}

await start()

const shutdown = () => server.close(() => process.exit(0))
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
setTimeout(shutdown, 8 * 60 * 60 * 1000).unref()
