import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
  if (!child || child.exitCode !== null) return
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
let collisionReuse
let postCollisionReuse
let blocker
let slowBlocker
let slowFallback
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

  const unrelatedSibling = await request(firstServer.port, '/LILITH_BOOTSTRAP.md')
  assert.equal(unrelatedSibling.statusCode, 404, 'personal server must not expose unrelated repository files')

  const dragonAsset = await request(firstServer.port, '/greyblue-dragon-flight-m1/dragon.glb')
  assert.equal(dragonAsset.statusCode, 200, 'personal server must continue serving Greyblue model assets')

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

  collisionReuse = spawnGreyblue()
  const collisionReuseServer = await readServerUrl(collisionReuse, 'collision reuse Greyblue')
  assert.equal(collisionReuseServer.url, fallbackServer.url, 'repeat launch during a preferred-port collision should reuse the stable fallback')
  const [collisionReuseCode] = await Promise.race([
    once(collisionReuse, 'exit'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('collision reuse Greyblue launch did not exit')), 3000))
  ])
  assert.equal(collisionReuseCode, 0, 'collision reuse launch should exit after finding the stable fallback')
  collisionReuse = null

  await closeServer(blocker)
  blocker = null

  postCollisionReuse = spawnGreyblue()
  const postCollisionServer = await readServerUrl(postCollisionReuse, 'post-collision reuse Greyblue')
  assert.equal(postCollisionServer.url, fallbackServer.url, 'fallback should remain canonical after the preferred port becomes free')
  const [postCollisionCode] = await Promise.race([
    once(postCollisionReuse, 'exit'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('post-collision Greyblue launch did not exit')), 3000))
  ])
  assert.equal(postCollisionCode, 0, 'post-collision reuse launch should exit after finding the stable fallback')
  postCollisionReuse = null

  await stopChild(collisionFallback)
  collisionFallback = null

  const instanceId = createHash('sha256').update(repoRoot.toLowerCase()).digest('hex').slice(0, 16)
  const preferredPort = 41000 + (Number.parseInt(instanceId.slice(0, 4), 16) % 20000)
  slowBlocker = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.write('{\"service\":\"unrelated\"')
    const timer = setInterval(() => res.write(' '), 100)
    res.on('close', () => clearInterval(timer))
  })
  await new Promise((resolveListen, reject) => {
    slowBlocker.once('error', reject)
    slowBlocker.listen(preferredPort, '127.0.0.1', resolveListen)
  })

  slowFallback = spawnGreyblue()
  const slowFallbackServer = await readServerUrl(slowFallback, 'slow unrelated-service fallback Greyblue')
  assert.notEqual(slowFallbackServer.port, preferredPort, 'a trickling unrelated service must not stall Greyblue startup')
  assert.equal((await request(slowFallbackServer.port, '/greyblue-archipelago/')).statusCode, 200)
  await stopChild(slowFallback)
  slowFallback = null
  await closeServer(slowBlocker)
  slowBlocker = null

  console.log('Greyblue personal server singleton regression: pass')
} finally {
  await stopChild(first)
  await stopChild(collisionFallback)
  await stopChild(collisionReuse)
  await stopChild(postCollisionReuse)
  await stopChild(slowFallback)
  if (blocker?.listening) await closeServer(blocker)
  if (slowBlocker?.listening) await closeServer(slowBlocker)
}
