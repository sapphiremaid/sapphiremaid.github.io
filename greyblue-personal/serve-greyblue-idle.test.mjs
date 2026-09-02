import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import http from 'node:http'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

function request(port) {
  return new Promise((resolveRequest, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/greyblue-archipelago/' }, (res) => {
      res.resume()
      res.on('end', () => resolveRequest(res.statusCode))
    })
    req.on('error', reject)
  })
}

const child = spawn(process.execPath, ['greyblue-personal/serve-greyblue.mjs'], {
  cwd: repoRoot,
  env: { ...process.env, GREYBLUE_NO_OPEN: '1', GREYBLUE_IDLE_SHUTDOWN_MS: '500' },
  stdio: ['ignore', 'pipe', 'pipe']
})

try {
  const lines = createInterface({ input: child.stdout })
  const [line] = await Promise.race([
    once(lines, 'line'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('idle-timeout server start timed out')), 3000))
  ])
  const match = /^http:\/\/127\.0\.0\.1:(\d+)\/greyblue-archipelago\/$/.exec(line)
  assert.ok(match, `unexpected server URL: ${line}`)
  const port = Number(match[1])

  await sleep(325)
  assert.equal(await request(port), 200, 'activity before the idle deadline should keep Greyblue available')
  await sleep(325)
  assert.equal(child.exitCode, null, 'activity must refresh the idle shutdown deadline')

  const [code] = await Promise.race([
    once(child, 'exit'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('server did not exit after refreshed idle deadline')), 1000))
  ])
  assert.equal(code, 0)
  console.log('Greyblue personal server idle shutdown regression: pass')
} finally {
  if (child.exitCode === null) child.kill('SIGTERM')
}