import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import http from 'node:http'
import { dirname, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function request(port, path) {
  return new Promise((resolveRequest, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      res.resume()
      res.on('end', () => resolveRequest(res.statusCode))
    })
    req.on('error', reject)
    req.end()
  })
}

const child = spawn(process.execPath, ['greyblue-personal/serve-greyblue.mjs'], {
  cwd: repoRoot,
  env: { ...process.env, GREYBLUE_NO_OPEN: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
})

let stderr = ''
child.stderr.setEncoding('utf8')
child.stderr.on('data', (chunk) => { stderr += chunk })

try {
  const lines = createInterface({ input: child.stdout })
  const [line] = await Promise.race([
    once(lines, 'line'),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Greyblue server start timed out. stderr: ${stderr}`)), 3000))
  ])
  const match = /^http:\/\/127\.0\.0\.1:(\d+)\/greyblue-archipelago\/$/.exec(line)
  assert.ok(match, `Unexpected Greyblue server URL: ${line}`)
  const port = Number(match[1])

  assert.equal(await request(port, '/%E0%A4%A'), 404, 'malformed URL encoding should return 404')
  assert.equal(child.exitCode, null, `server exited after malformed URL: ${stderr}`)
  assert.equal(await request(port, '/greyblue-archipelago/'), 200, 'server should remain usable after malformed URL')
  console.log('Greyblue personal server malformed URL regression: pass')
} finally {
  if (child.exitCode === null) child.kill('SIGTERM')
  if (child.exitCode === null) await once(child, 'exit')
}
