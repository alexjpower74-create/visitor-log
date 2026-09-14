// The door sign: the home name, SAMPLE while the home is sample, and a QR code for this address's sign-in page (location.origin + "/").
// No token needed: GET /api/info is public and the sign holds nothing private.
import * as api from '/common/api.js'
import { drawQr } from '/common/qr.js'

const $ = (s) => document.querySelector(s)
const url = `${location.origin}/`

$('#back-to-settings').href = `${api.withMock('/settings/')}#tab=door-sign`
drawQr($('#door-qr'), url, { size: 300 })
$('#door-url').textContent = url
$('#print-sign').addEventListener('click', () => window.print())

try {
  const info = await api.get('/api/info')
  $('#door-home').textContent = info.home_name
  $('#door-sample').hidden = !info.sample
  document.title = `Door sign · ${info.home_name}`
  if (info.phone) $('#door-note').textContent = `Questions? Call ${info.phone}.`
} catch (e) {
  $('#door-error').textContent = e.message
}
