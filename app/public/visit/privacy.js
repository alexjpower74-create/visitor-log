// /privacy/: the privacy notice, with the home's own name, retention period and phone number from the API.
import { $, api, days, paintHeader } from './visit.js'

async function boot() {
  const r = await api('GET', '/api/visitor/start')
  if (!r.ok) return
  paintHeader(r.body)
  $('#privacy-days').textContent = days(r.body.retention_days)
  if (r.body.home_name) $('#privacy-home').textContent = r.body.home_name
  if (r.body.phone) $('#privacy-questions').textContent = `Questions: call ${r.body.phone}.`
}

boot()
