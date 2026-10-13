// The online setup (DEPLOY_PLAN.md, D1): one service serves the built
// website and /api from the same address. Needs dist/ — the website tests
// skip when `npm run build` has not been run.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import app from './app.js'
import { pool } from './db.js'

const hasBuild = fs.existsSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.html'))
let server
let baseUrl
before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://localhost:${server.address().port}`
})
after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await pool.end()
})

test('a page address returns the website, so links like the PayMongo return link open directly', { skip: !hasBuild && 'no dist/ — run npm run build' }, async () => {
  const response = await fetch(`${baseUrl}/account?tab=payments&order=12`)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /text\/html/)
  assert.equal(response.headers.get('cache-control'), 'no-cache', 'a new deploy shows at once')
  assert.match(await response.text(), /<div id="root">/)
})

test('built scripts are cached long-term', { skip: !hasBuild && 'no dist/ — run npm run build' }, async () => {
  const html = await (await fetch(`${baseUrl}/`)).text()
  const script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1]
  assert.ok(script, 'index.html links a hashed script')
  const response = await fetch(`${baseUrl}${script}`)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('cache-control'), /immutable/)
})

test('an unknown /api path still answers with JSON, not the website', async () => {
  const response = await fetch(`${baseUrl}/api/no-such-route`)
  assert.equal(response.status, 404)
  assert.doesNotMatch(response.headers.get('content-type') ?? '', /text\/html/)
})
