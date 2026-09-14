// Runs first on the fresh Worker tests/run.mjs starts (migrated D1, no reset yet).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { call, HOME, PIN } from './api-helpers.mjs'

test('empty D1: info and the visitor start before the home row exists (home_name "", sample false, retention 30); a reset then makes the SAMPLE home', async () => {
  const info = await call('GET', '/api/info')
  assert.equal(info.status, 200, JSON.stringify(info.body))
  assert.deepEqual([info.body.home_name, info.body.phone, info.body.sample, info.body.retention_days], ['', '', false, 30],
    'no home yet: no name, no phone, no SAMPLE badge, the default retention')
  const start = await call('GET', '/api/visitor/start')
  assert.equal(start.status, 200, JSON.stringify(start.body))
  assert.deepEqual([start.body.home_name, start.body.sample, start.body.home_notices, start.body.screening],
    ['', false, [], { enabled: false, questions: [], stop_message: '' }])
  assert.equal((await call('POST', '/api/signin', { body: { pin: PIN.donna } })).status, 401, 'no staff before a reset')
  assert.equal((await call('POST', '/api/test/reset')).status, 200)
  const after = await call('GET', '/api/info')
  assert.deepEqual([after.body.home_name, after.body.sample], [HOME, true])
})
