// Draw a QR code on a <canvas> with the vendored qrcode-generator (global `qrcode`, loaded by a <script> tag on the page).
// Black modules on white with the 4-module quiet zone kept, sharp at any device pixel ratio.

export function drawQr(canvas, text, { size = 280 } = {}) {
  const qr = window.qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const modules = qr.getModuleCount()
  const quiet = 4
  const cells = modules + quiet * 2
  const scale = Math.max(2, Math.ceil(size / cells))
  const css = cells * scale
  const dpr = Math.max(1, Math.ceil(window.devicePixelRatio || 1))
  canvas.width = css * dpr
  canvas.height = css * dpr
  canvas.style.width = `${css}px`
  canvas.style.height = `${css}px`
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000000'
  const px = scale * dpr
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * px, (r + quiet) * px, px, px)
    }
  }
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', `QR code for ${text}`)
  canvas.dataset.qrText = text
  return canvas
}
