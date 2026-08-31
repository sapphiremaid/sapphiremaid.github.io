import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import http, { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function request(port, path) {
  return new Promise((resolveRequest, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolveRequest({ statusCode: res.statusCode, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

function spawnGreyblue() {
  return spawn(process.execPath, ['greyblue-personal/serve-greyblue.mjs'], {
    cwd: repoRoot,
    env: { ...process.env, GREYBLUE_NO_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

async function readServerUrl(child, label) {
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => { stderr += chunk })
  const lines = createInterface({ input: child.stdout })
  const [line] = await Promise.race([
    once(lines, 'line'),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} start timed out. stderr: ${stderr}`)), 3000))
  ])
  const match = /^http:\/\/127\.0\.0\.1:(\d+)\/greyblue-archipelago\/$/.exec(line)
  assert.ok(match, `Unexpected ${label} server URL: ${line}`)
  return { url: line, port: Number(match[1]) }
}

async function stopChild(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await once(child, 'exit')
}

async function closeServer(server) {
  await new Promise((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose())
  })
}

let first
let collisionFallback
let blocker
try {
  first = spawnGreyblue()
  const firstServer = await readServerUrl(first, 'first Greyblue')

  const second = spawnGreyblue()
  const secondServer = await readServerUrl(second, 'second Greyblue')
  assert.equal(secondServer.url, firstServer.url, 'repeat launch should reuse the existing bundle server')
  const [secondCode] = await Promise.race([
    once(second, 'exit'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('repeat Greyblue launch did not exit')), 3000))
  ])
  assert.equal(secondCode, 0, 'repeat launch should exit after reusing the existing server')

  const malformed = await request(firstServer.port, '/%E0%A4%A')
  assert.equal(malformed.statusCode, 404, 'malformed URL encoding should return 404')
  assert.equal(first.exitCode, null, 'server should remain alive after malformed URL')

  const entry = await request(firstServer.port, '/greyblue-archipelago/')
  assert.equal(entry.statusCode, 200, 'server should remain usable after malformed URL')

  const identity = await request(firstServer.port, '/__greyblue_instance__')
  assert.equal(identity.statusCode, 200)
  const identityPayload = JSON.parse(identity.body)
  assert.equal(identityPayload.service, 'greyblue-personal')

  await stopChild(first)
  first = null

  blocker = createServer((_req, res) => {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('unrelated service')
  })
  await new Promise((resolveListen, reject) => {
    blocker.once('error', reject)
    blocker.listen(firstServer.port, '127.0.0.1', resolveListen)
  })

  collisionFallback = spawnGreyblue()
  const fallbackServer = await readServerUrl(collisionFallback, 'collision fallback Greyblue')
  assert.notEqual(fallbackServer.port, firstServer.port, 'unrelated port owner must not be mistaken for Greyblue')
  assert.equal((await request(fallbackServer.port, '/greyblue-archipelago/')).statusCode, 200)

  console.log('Greyblue personal server singleton regression: pass')
} finally {
  await stopChild(first)
  await stopChild(collisionFallback)
  if (blocker?.listening) await closeServer(blocker)
}
