// /out/?t=<token>: the visitor's signed-in page and Sign out, or the signed-out sentence, or the link's error and nothing else.
import { api, paintHeader, showLinkError, showVisit, store, VISIT_KEY } from './visit.js'

async function boot() {
  const token = new URLSearchParams(location.search).get('t') || ''
  const [start, visit] = await Promise.all([
    api('GET', '/api/visitor/start'),
    token ? api('GET', `/api/visit/${encodeURIComponent(token)}`) : Promise.resolve(null),
  ])
  if (start.ok) paintHeader(start.body)
  if (!token) return showLinkError()
  if (visit.ok) {
    if (visit.body.visit.state === 'in') store.set(VISIT_KEY, token)
    else if (store.get(VISIT_KEY) === token) store.remove(VISIT_KEY)
    return showVisit(visit.body.visit, token)
  }
  if (store.get(VISIT_KEY) === token) store.remove(VISIT_KEY)
  showLinkError(visit.body.error)
}

boot()
