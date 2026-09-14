// The PIN keypad for staff and settings: button.key[data-key="0".."9"], Clear, #pin-enter "Enter", errors in #pin-error.
// 64 px keys. A physical keyboard works too (digits, Backspace, Enter) for a desk with one.
import { h } from './ui.js'

const MAX = 6

/**
 * Render a keypad screen into `root`.
 * onSubmit(pin) → resolves to nothing on success, or an error text to show in #pin-error.
 */
export function mountKeypad(root, { title, intro = '', onSubmit }) {
  let pin = ''
  let busy = false

  const dots = h('div', { class: 'pin-display', id: 'pin-display', 'aria-live': 'polite', 'aria-label': 'PIN digits entered: 0' })
  const error = h('p', { id: 'pin-error', role: 'alert' })
  const enter = h('button', { type: 'button', id: 'pin-enter', class: 'keypad-action primary' }, 'Enter')
  const clear = h('button', { type: 'button', class: 'keypad-action', id: 'pin-clear' }, 'Clear')
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(key)
  const grid = h('div', { class: 'keypad' }, ...keys, clear, key('0'), enter)

  function key(d) {
    return h('button', { type: 'button', class: 'key', 'data-key': d, 'aria-label': d }, d)
  }

  function paint() {
    dots.replaceChildren(...Array.from({ length: Math.max(4, pin.length) }, (_, i) => h('span', { class: `pin-dot${i < pin.length ? ' filled' : ''}` })))
    dots.setAttribute('aria-label', `PIN digits entered: ${pin.length}`)
    enter.disabled = busy || pin.length < 4
  }

  function press(d) {
    if (busy || pin.length >= MAX) return
    pin += d
    error.textContent = ''
    paint()
  }

  async function submit() {
    if (busy || pin.length < 4) return
    busy = true
    paint()
    const entered = pin
    pin = ''
    let message = null
    try { message = await onSubmit(entered) } catch (e) { message = e?.message || 'Something went wrong. Please try again.' }
    busy = false
    if (message) error.textContent = message
    paint()
  }

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    if (b.dataset.key) press(b.dataset.key)
    else if (b === clear) { pin = ''; error.textContent = ''; paint() }
    else if (b === enter) submit()
  })

  const onKey = (e) => {
    if (!root.isConnected || root.hidden) return
    if (e.target.closest?.('input, textarea, select')) return
    if (/^[0-9]$/.test(e.key)) { press(e.key); e.preventDefault() }
    else if (e.key === 'Backspace') { pin = pin.slice(0, -1); paint() }
    else if (e.key === 'Enter') { submit(); e.preventDefault() }
  }
  document.addEventListener('keydown', onKey)

  root.replaceChildren(h('section', { class: 'keypad-screen card' },
    h('h1', {}, title),
    intro ? h('p', { class: 'muted' }, intro) : null,
    dots, grid, error))
  paint()

  return {
    showError(text) { error.textContent = text || '' },
    reset() { pin = ''; busy = false; paint() },
    destroy() { document.removeEventListener('keydown', onKey) },
  }
}
