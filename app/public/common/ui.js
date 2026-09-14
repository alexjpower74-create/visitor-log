// Small DOM helpers shared by the staff pages and settings. No framework.

/** h('div', { class: 'x', onclick: fn }, 'text', child) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v)
    else if (k === 'class') el.className = v
    else if (k === 'text') el.textContent = v
    else if (k in el && typeof v !== 'string') el[k] = v
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue
    el.append(c instanceof Node ? c : document.createTextNode(String(c)))
  }
  return el
}

export const $ = (sel, root = document) => root.querySelector(sel)
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** A notice as visitors see it: 6 px severity edge, a pill with the label (and unit name), then the home's words. */
export function noticeCard(notice, { compact = false } = {}) {
  const label = notice.unit ? `${notice.severity_label} · ${notice.unit.name}` : notice.severity_label
  return h('div', { class: `notice${compact ? ' compact' : ''}`, 'data-severity': notice.severity, 'data-notice': notice.id },
    h('span', { class: 'sev-pill' }, label),
    h('p', { class: 'notice-message' }, notice.message))
}

/** The home name with its SAMPLE badge. */
export function homeLine(info) {
  return h('div', { class: 'home-line' },
    h('span', { class: 'home-name', id: 'home-name' }, info?.home_name || 'Visitor log'),
    h('span', { class: 'sample-badge', hidden: !info?.sample }, 'SAMPLE'))
}

/**
 * Tabs with role="tab". tabs: [{ id, label }]. The panel for a tab is the element with id `panel-<id>`.
 * The chosen tab is kept in location.hash (#tab=<id>) so a reload stays put.
 */
export function mountTabs(tablist, tabs, onChange) {
  const buttons = tabs.map((t) => h('button', {
    type: 'button', role: 'tab', id: `tab-${t.id}`, 'aria-controls': `panel-${t.id}`, 'aria-selected': 'false', tabindex: '-1', 'data-tab': t.id,
  }, t.label))
  tablist.setAttribute('role', 'tablist')
  tablist.replaceChildren(...buttons)
  let current = null

  function select(id, { focus = false } = {}) {
    if (!tabs.some((t) => t.id === id)) id = tabs[0].id
    for (const b of buttons) {
      const on = b.dataset.tab === id
      b.setAttribute('aria-selected', on ? 'true' : 'false')
      b.tabIndex = on ? 0 : -1
      if (on && focus) b.focus()
      const panel = document.getElementById(`panel-${b.dataset.tab}`)
      if (panel) panel.hidden = !on
    }
    if (history.replaceState) history.replaceState(null, '', `${location.pathname}${location.search}#tab=${id}`)
    const changed = current !== id
    current = id
    onChange?.(id, changed)
  }

  tablist.addEventListener('click', (e) => {
    const b = e.target.closest('[role="tab"]')
    if (b) select(b.dataset.tab)
  })
  tablist.addEventListener('keydown', (e) => {
    const i = buttons.findIndex((b) => b.dataset.tab === current)
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
    if (step) { e.preventDefault(); select(buttons[(i + step + buttons.length) % buttons.length].dataset.tab, { focus: true }) }
  })

  const fromHash = (location.hash.match(/tab=([\w-]+)/) || [])[1]
  return { select, current: () => current, initial: fromHash || tabs[0].id }
}

/** Clear every .field-error inside scope. */
export function clearErrors(scope) {
  for (const el of scope.querySelectorAll('.field-error')) el.textContent = ''
}

/** Put an API error's text, as is, under the input the API named (`[data-error-for="<field>"]`), else in `fallback`. */
export function showError(scope, err, fallback) {
  const byField = err?.field ? scope.querySelector(`[data-error-for="${CSS.escape(err.field)}"]`) : null
  const target = byField || fallback
  if (target) target.textContent = err?.message || String(err)
  const input = byField && scope.querySelector(`[name="${CSS.escape(err.field)}"]`)
  if (input && typeof input.focus === 'function' && !input.matches('[type="checkbox"]')) input.focus({ preventScroll: false })
  return target
}

export const errorSlot = (field) => h('p', { class: 'field-error', 'data-error-for': field, role: 'alert' })

/** An inline confirmation: text, a yes button (with class/id you pass) and Cancel. */
export function confirmBox({ text, yesLabel, yesClass = '', yesId, onYes, onCancel, danger = true, big = false }) {
  const yes = h('button', { type: 'button', class: `${danger ? 'danger-action' : 'primary'} ${yesClass}${big ? ' big' : ''}`, id: yesId }, yesLabel)
  const cancel = h('button', { type: 'button', class: `cancel${big ? ' big' : ''}` }, 'Cancel')
  const box = h('div', { class: 'confirm', role: 'group', 'aria-label': text },
    h('span', { class: 'confirm-text' }, text), yes, cancel)
  yes.addEventListener('click', () => onYes?.(yes, box))
  cancel.addEventListener('click', () => onCancel?.(box))
  return box
}

/** A repeating task: runs fn, waits ms after it finishes, runs again. Skips while the page is hidden. */
export function poller(fn, ms) {
  let timer = null
  let running = false
  const loop = async () => {
    timer = null
    if (!running) return
    if (!document.hidden) { try { await fn() } catch {} }
    if (running) timer = setTimeout(loop, ms)
  }
  return {
    start({ now = true } = {}) { if (running) return; running = true; now ? loop() : (timer = setTimeout(loop, ms)) },
    stop() { running = false; if (timer) clearTimeout(timer); timer = null },
    get running() { return running },
  }
}

/** Add days to a home-local 'YYYY-MM-DD' (calendar arithmetic only; never reads the browser clock). */
export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

/** Keep a <select>'s choice across a re-render of its options. */
export function fillSelect(select, options, { keep = true } = {}) {
  const before = select.value
  select.replaceChildren(...options)
  if (keep && [...select.options].some((o) => o.value === before)) select.value = before
}
