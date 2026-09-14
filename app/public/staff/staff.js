// Staff pages: In the building (polls 5 s), Roll call (polls 3 s), Day log, Contact list, Sign someone in.
// Everything comes from docs/API.md through common/api.js. Times and dates are the API's labels, never the browser clock.
// A poll never re-renders a row with an open confirmation, a row under someone's finger or a row holding focus.
import * as api from '/common/api.js'
import { h, $, plural, noticeCard, homeLine, paintClock, timeText, mountTabs, clearErrors, showError, confirmBox, poller, addDays, fillSelect } from '/common/ui.js'
import { mountKeypad } from '/common/keypad.js'

const TABS = [
  { id: 'building', label: 'In the building' },
  { id: 'roll-call', label: 'Roll call' },
  { id: 'day-log', label: 'Day log' },
  { id: 'contacts', label: 'Contact list' },
  { id: 'sign-in', label: 'Sign someone in' },
]
const KIND_WORD = { auto: 'Auto', staff: 'Staff', visitor: 'Visitor' }

let info = null
let tabs = null
let keypad = null
let staffLists = null // GET /api/staff/residents

const setClock = (dateLabel, timeLabel) => paintClock($('#clock'), dateLabel, timeLabel)

async function loadInfo() {
  info = await api.get('/api/info')
  $('#header-home').replaceWith(Object.assign(homeLine(info), { id: 'header-home' }))
  setClock(info.date_label, info.time_label)
  return info
}

// ---------- sign in / out ----------
function showKeypad(message) {
  stopPolling()
  // Never keep a number from before: until the next answer the total shows no count.
  building = null
  $('#building-total').replaceChildren(h('span', { class: 'total-number' }, '…'), ' in the building')
  $('#app').hidden = true
  $('#who-line').hidden = true
  const root = $('#signin')
  root.hidden = false
  keypad?.destroy()
  keypad = mountKeypad(root, {
    title: 'Staff sign in',
    intro: 'Tap your PIN, then Enter.',
    onSubmit: async (pin) => {
      try {
        await api.signIn(pin)
      } catch (e) {
        return e.message
      }
      showApp()
      return null
    },
  })
  if (message) keypad.showError(message)
}

function showApp() {
  keypad?.destroy()
  keypad = null
  $('#signin').hidden = true
  $('#signin').replaceChildren()
  $('#app').hidden = false
  const who = api.session.who()
  $('#who-line').hidden = false
  $('#who-name').textContent = who?.name || ''
  const link = $('#settings-link')
  link.hidden = who?.role !== 'manager'
  link.href = api.withMock('/settings/')
  if (!tabs) {
    tabs = mountTabs($('#tabs'), TABS, onTab)
    tabs.select(tabs.initial)
  } else {
    tabs.select(tabs.current() || 'building')
  }
}

$('#staff-signout').addEventListener('click', async () => {
  await api.signOut()
  showKeypad()
})
window.addEventListener(api.SIGNED_OUT_EVENT, () => showKeypad('Please sign in again.'))

// ---------- tabs and polling ----------
const buildingPoll = poller(refreshBuilding, 5000)
const rollPoll = poller(refreshRoll, 3000)
const clockPoll = poller(async () => { const i = await api.get('/api/info'); info = i; setClock(i.date_label, i.time_label) }, 30000)
function stopPolling() { buildingPoll.stop(); rollPoll.stop(); clockPoll.stop() }

function onTab(id) {
  stopPolling()
  if (id === 'building') buildingPoll.start()
  else if (id === 'roll-call') rollPoll.start()
  else {
    clockPoll.start({ now: false })
    if (id === 'day-log') openLog()
    else if (id === 'contacts') openContacts()
    else if (id === 'sign-in') openManual()
  }
}

const showLoadError = (e) => { $('#load-error').textContent = e?.status === 401 ? '' : e?.message || '' }
const clearLoadError = () => { $('#load-error').textContent = '' }

/**
 * Put `items` into `list` in order, keyed by data attribute `attr`. A node whose item is unchanged is kept; a locked node is kept
 * as it is (even when its item changed or left) so nothing moves under a finger or an open confirmation. Answers true when a
 * locked node was holding back a change.
 */
function reconcile(list, items, { attr, key, build, locked }) {
  const existing = new Map([...list.children].filter((n) => n.dataset[attr] !== undefined).map((n) => [n.dataset[attr], n]))
  const ids = items.map(key)
  const order = [...ids]
  let held = false
  ;[...existing.keys()].forEach((id, index) => {
    if (locked(id) && !ids.includes(id)) { order.splice(Math.min(index, order.length), 0, id); held = true }
  })
  const byId = new Map(items.map((it) => [key(it), it]))
  const wanted = order.map((id) => {
    const node = existing.get(id)
    const item = byId.get(id)
    if (node && locked(id)) { if (item && node.dataset.sig !== sig(item)) held = true; return node }
    if (node && item && node.dataset.sig === sig(item)) return node
    const fresh = build(item)
    fresh.dataset.sig = sig(item)
    return fresh
  })
  for (const n of [...list.children]) if (!wanted.includes(n)) n.remove()
  wanted.forEach((node, i) => {
    const at = list.children[i]
    if (at !== node) {
      const old = existing.get(node.dataset[attr])
      if (old && old !== node && old.parentNode === list) list.replaceChild(node, old)
      else list.insertBefore(node, at || null)
    }
  })
  return held
}
const sig = (item) => JSON.stringify(item)

// ---------- In the building ----------
let building = null
let buildingMutation = 0
const openConfirms = new Set()
let fingerOn = null
let buildingHeld = false

function rowLocked(id) {
  if (openConfirms.has(id) || fingerOn === id) return true
  const active = document.activeElement
  return !!active?.closest?.(`[data-visit="${CSS.escape(id)}"]`)
}

async function refreshBuilding() {
  const seq = buildingMutation
  try {
    const data = await api.get('/api/staff/building')
    if (seq !== buildingMutation) return // a sign-out landed while this was on its way; the next poll brings the new state
    building = data
    clearLoadError()
    renderBuilding()
  } catch (e) {
    showLoadError(e)
  }
}

function renderBuilding() {
  if (!building) return
  setClock(building.date_label, building.time_label)
  $('#building-total').replaceChildren(h('span', { class: 'total-number' }, String(building.total)), ' in the building')

  const banner = $('#roll-call-banner')
  if (building.roll_call) {
    banner.hidden = false
    banner.textContent = `Roll call going: ${building.roll_call.found} of ${building.roll_call.total} found`
  } else banner.hidden = true

  // Whole-home notices (unit: null) once above the cards; each card shows only its own unit's notices.
  const homeNotices = []
  for (const u of building.units) for (const n of u.notices) if (!n.unit && !homeNotices.some((x) => x.id === n.id)) homeNotices.push(n)
  const homeBox = $('#building-notices')
  const homeSig = sig(homeNotices)
  if (homeBox.dataset.sig !== homeSig) {
    homeBox.replaceChildren(...homeNotices.map((n) => noticeCard(n)))
    homeBox.dataset.sig = homeSig
  }
  homeBox.hidden = homeNotices.length === 0

  const grid = $('#units')
  buildingHeld = false
  reconcileCards(grid, building.units)

  const auto = building.auto_today || []
  $('#auto-today').hidden = auto.length === 0
  $('#auto-today-list').replaceChildren(...auto.map((v) => h('li', { 'data-auto-visit': v.id },
    h('strong', {}, v.visitor_name),
    h('span', { class: 'muted' }, `${v.unit.name} · visiting ${v.resident.name}`),
    h('span', {}, `In ${v.in_label}, signed out automatically at ${v.out_label}`))))
}

function reconcileCards(grid, units) {
  const cards = new Map([...grid.children].map((c) => [c.dataset.unit, c]))
  units.forEach((u, i) => {
    let card = cards.get(u.id)
    if (!card) card = unitCard(u)
    updateCard(card, u)
    if (grid.children[i] !== card) grid.insertBefore(card, grid.children[i] || null)
    cards.delete(u.id)
  })
  for (const c of cards.values()) c.remove()
}

function unitCard(u) {
  return h('section', { class: 'card unit-card', 'data-unit': u.id, 'aria-label': u.name },
    h('div', { class: 'unit-head' },
      h('div', { class: 'grow' },
        h('h2', { class: 'unit-name' }),
        h('p', { class: 'unit-hours' }),
        h('div', { class: 'tags' }, h('span', { class: 'pill unit-closed-pill', hidden: true }, 'Unit closed'), h('span', { class: 'pill open-pill' }))),
      h('span', { class: 'unit-count', 'aria-label': 'visitors in the building on this unit' })),
    h('p', { class: 'unit-closed-note', hidden: true }, 'This unit is closed in Settings, but these visitors are still signed in. Sign them out as they leave.'),
    h('div', { class: 'unit-notices' }),
    h('div', { class: 'visits' }),
    h('p', { class: 'empty-unit' }, 'Nobody is signed in on this unit.'))
}

function updateCard(card, u) {
  card.querySelector('.unit-name').textContent = u.name
  // A unit closed in Settings that still has visitors in the building (API: active false) stays listed, marked apart from the
  // Open/Closed visiting-hours pill, and its rows keep Sign out.
  const unitClosed = u.active === false
  card.dataset.unitActive = unitClosed ? 'false' : 'true'
  card.querySelector('.unit-closed-pill').hidden = !unitClosed
  card.querySelector('.unit-closed-note').hidden = !unitClosed
  card.querySelector('.open-pill').hidden = unitClosed // a closed unit never reads "Open"
  card.querySelector('.unit-hours').hidden = unitClosed // nor "Open all day"
  const hours = card.querySelector('.unit-hours')
  if (hours.dataset.label !== u.hours_label) {
    hours.replaceChildren(...timeText(u.hours_label))
    hours.dataset.label = u.hours_label
  }
  const pill = card.querySelector('.open-pill')
  pill.textContent = u.open_now ? 'Open' : 'Closed'
  pill.className = `pill open-pill ${u.open_now ? 'open' : 'closed'}`
  card.querySelector('.unit-count').textContent = String(u.count)
  const own = u.notices.filter((n) => n.unit && n.unit.id === u.id)
  const noticeSig = sig(own)
  const notices = card.querySelector('.unit-notices')
  if (notices.dataset.sig !== noticeSig) {
    notices.replaceChildren(...own.map((n) => noticeCard(n, { compact: true })))
    notices.dataset.sig = noticeSig
  }
  const list = card.querySelector('.visits')
  if (reconcile(list, u.visits, { attr: 'visit', key: (v) => v.id, build: visitRow, locked: rowLocked })) buildingHeld = true
  card.querySelector('.empty-unit').hidden = list.children.length > 0
}

function visitRow(v) {
  return h('article', { class: 'visit-row', 'data-visit': v.id, 'data-overdue': v.overdue ? 'true' : 'false' },
    h('div', { class: 'visit-main' },
      h('p', { class: 'visitor-name' }, v.visitor_name),
      v.visitor_phone
        ? h('a', { class: 'phone', href: `tel:${v.visitor_phone.replace(/[^\d]/g, '')}` }, v.visitor_phone)
        : h('p', { class: 'no-phone' }, 'No phone'),
      h('p', {}, `Visiting ${v.resident.name}, Room ${v.resident.room}`),
      h('div', { class: 'tags' },
        h('span', { class: 'in-since' }, ...timeText(`In since ${v.in_label}`)),
        v.method === 'staff' ? h('span', { class: 'pill staff-tag' }, 'Signed in by staff') : null,
        v.overdue ? h('span', { class: 'pill overdue overdue-chip' }, `Overdue since ${v.due_label}`) : null)),
    h('button', { type: 'button', class: 'sign-out-visit' }, 'Sign out'),
    h('div', { class: 'row-slot' }))
}

const units = $('#units')
units.addEventListener('pointerdown', (e) => { fingerOn = e.target.closest('[data-visit]')?.dataset.visit || null })
const releaseFinger = () => setTimeout(() => {
  fingerOn = null
  if (buildingHeld) renderBuilding()
}, 400)
window.addEventListener('pointerup', releaseFinger)
window.addEventListener('pointercancel', releaseFinger)

units.addEventListener('click', (e) => {
  const button = e.target.closest('button.sign-out-visit')
  if (!button) return
  const row = button.closest('[data-visit]')
  const id = row.dataset.visit
  const name = row.querySelector('.visitor-name').textContent
  openConfirms.add(id)
  $('#building-status').textContent = ''
  button.hidden = true
  const slot = row.querySelector('.row-slot')
  const close = () => {
    openConfirms.delete(id)
    slot.replaceChildren()
    button.hidden = false
    renderBuilding()
  }
  slot.replaceChildren(confirmBox({
    text: `Sign out ${name}?`,
    yesLabel: 'Yes, sign out',
    yesClass: 'confirm-sign-out',
    onYes: async (yes) => {
      yes.disabled = true
      buildingMutation++
      try {
        await api.post(`/api/staff/visits/${encodeURIComponent(id)}/signout`)
        openConfirms.delete(id)
        dropVisit(id)
      } catch (err) {
        openConfirms.delete(id)
        $('#building-status').textContent = err.message
      }
      renderBuilding()
      refreshBuilding()
    },
    onCancel: close,
  }))
  slot.querySelector('.confirm-sign-out').focus()
})

/** The sign-out is done: take the visit out of what the page shows now, so the row, its unit count and the total drop at once. */
function dropVisit(id) {
  if (!building) return
  for (const u of building.units) {
    const before = u.visits.length
    u.visits = u.visits.filter((v) => v.id !== id)
    if (u.visits.length !== before) { u.count = Math.max(0, u.count - 1); building.total = Math.max(0, building.total - 1) }
  }
}

$('#roll-call-banner').addEventListener('click', () => tabs.select('roll-call'))

// ---------- Roll call ----------
let rollCall = null
let rollId = null
let rollMutation = 0
let rollFinger = null
let rollHeld = false
let endConfirmOpen = false

async function refreshRoll() {
  const seq = rollMutation
  try {
    let rc = (await api.get('/api/staff/rollcall/current')).roll_call
    if (!rc && rollId) rc = (await api.get(`/api/staff/rollcall/${encodeURIComponent(rollId)}`)).roll_call
    if (seq !== rollMutation) return
    rollCall = rc
    rollId = rc?.id || null
    clearLoadError()
    renderRoll()
  } catch (e) {
    showLoadError(e)
  }
}

function renderRoll() {
  const rc = rollCall
  const ended = !!rc?.ended_at
  $('#roll-none').hidden = !!rc && !ended
  $('#roll-none-text').textContent = ended
    ? 'That roll call has ended. Start a new one if you need to.'
    : 'No roll call is going. Start one to tick off everyone who is signed in.'
  $('#roll-going').hidden = !rc
  if (!rc) return
  if (ended) endConfirmOpen = false
  $('#roll-call-progress').textContent = ended
    ? `Ended ${rc.ended_label} · ${rc.found} of ${rc.total} found`
    : `${rc.found} of ${rc.total} found`
  $('#roll-call-meta').textContent = `Started ${rc.started_label} by ${rc.started_by}${ended && rc.ended_by ? ` · ended by ${rc.ended_by}` : ''}`
  $('#end-roll-call').hidden = ended || endConfirmOpen
  if (ended) $('#roll-end-confirm').replaceChildren()

  const root = $('#roll-entries')
  const groups = []
  for (const e of rc.entries) {
    let g = groups.find((x) => x.id === e.unit.id)
    if (!g) groups.push((g = { id: e.unit.id, name: e.unit.name, entries: [] }))
    g.entries.push(e)
  }
  rollHeld = false
  const sections = new Map([...root.children].map((s) => [s.dataset.rollUnit, s]))
  groups.forEach((g, i) => {
    let section = sections.get(g.id)
    if (!section) section = h('section', { class: 'roll-group', 'data-roll-unit': g.id }, h('h3', {}, h('span', { class: 'roll-unit-name' }), h('span', { class: 'muted small roll-unit-count' })), h('div', { class: 'roll-rows' }))
    section.querySelector('.roll-unit-name').textContent = g.name
    section.querySelector('.roll-unit-count').textContent = `${g.entries.filter((x) => x.found).length} of ${g.entries.length} found`
    const locked = (id) => rollFinger === id || !!document.activeElement?.closest?.(`[data-roll="${CSS.escape(id)}"]`)
    const withState = g.entries.map((x) => ({ ...x, __ended: ended }))
    if (reconcile(section.querySelector('.roll-rows'), withState, { attr: 'roll', key: (x) => x.visit_id, build: rollRow, locked })) rollHeld = true
    if (root.children[i] !== section) root.insertBefore(section, root.children[i] || null)
    sections.delete(g.id)
  })
  for (const s of sections.values()) s.remove()
  if (!groups.length) root.replaceChildren(h('p', { class: 'muted empty-roll' }, 'Nobody was signed in when the roll call started.'))
  else root.querySelector('.empty-roll')?.remove()
}

function rollRow(e) {
  const ended = e.__ended
  return h('article', { class: 'roll-row', 'data-roll': e.visit_id, 'data-found': e.found ? 'true' : 'false' },
    h('div', { class: 'grow' },
      h('p', { class: 'visitor-name' }, e.visitor_name),
      h('p', {}, `Visiting ${e.resident_name}, Room ${e.room}`),
      h('div', { class: 'tags' },
        h('span', { class: 'muted' }, `In since ${e.in_label}`),
        e.visitor_phone ? h('a', { class: 'phone', href: `tel:${e.visitor_phone.replace(/[^\d]/g, '')}` }, e.visitor_phone) : null,
        e.after_start ? h('span', { class: 'pill staff-tag after-start' }, 'Came in after the roll call started') : null,
        e.out_label ? h('span', { class: 'pill auto signed-out' }, `Signed out at ${e.out_label}`) : null),
      e.found && e.found_by ? h('p', { class: 'small muted found-by' }, `Found by ${e.found_by} at ${e.found_label}`) : null),
    h('button', { type: 'button', class: 'found', 'aria-pressed': e.found ? 'true' : 'false', disabled: ended },
      e.found ? 'Found' : ended ? 'Not found' : 'Not found yet'))
}

const rollEntries = $('#roll-entries')
rollEntries.addEventListener('pointerdown', (e) => { rollFinger = e.target.closest('[data-roll]')?.dataset.roll || null })
const releaseRoll = () => setTimeout(() => { rollFinger = null; if (rollHeld) renderRoll() }, 400)
window.addEventListener('pointerup', releaseRoll)
window.addEventListener('pointercancel', releaseRoll)

rollEntries.addEventListener('click', async (e) => {
  const button = e.target.closest('button.found')
  if (!button || !rollCall) return
  const id = button.closest('[data-roll]').dataset.roll
  const found = button.getAttribute('aria-pressed') !== 'true'
  button.disabled = true
  rollMutation++
  $('#roll-status').textContent = ''
  try {
    const answer = await api.post(`/api/staff/rollcall/${encodeURIComponent(rollCall.id)}/found`, { visit_id: id, found })
    rollCall = answer.roll_call
    rollFinger = null
    renderRoll()
  } catch (err) {
    $('#roll-status').textContent = err.message
    button.disabled = false
    refreshRoll()
  }
})

$('#start-roll-call').addEventListener('click', () => {
  const slot = $('#roll-start-confirm')
  const start = $('#start-roll-call')
  start.hidden = true
  $('#roll-status').textContent = ''
  slot.replaceChildren(confirmBox({
    text: 'Start a roll call now?',
    yesLabel: 'Yes, start',
    yesId: 'confirm-roll-call',
    danger: false,
    big: true,
    onYes: async (yes) => {
      yes.disabled = true
      rollMutation++
      try {
        rollCall = (await api.post('/api/staff/rollcall')).roll_call
        rollId = rollCall.id
      } catch (err) {
        if (err.body?.roll_call_id) rollId = err.body.roll_call_id
        $('#roll-none-text').textContent = err.message
      }
      slot.replaceChildren()
      start.hidden = false
      renderRoll()
      refreshRoll()
    },
    onCancel: () => { slot.replaceChildren(); start.hidden = false },
  }))
})

$('#end-roll-call').addEventListener('click', () => {
  const slot = $('#roll-end-confirm')
  endConfirmOpen = true
  $('#end-roll-call').hidden = true
  slot.replaceChildren(confirmBox({
    text: 'End the roll call?',
    yesLabel: 'Yes, end it',
    yesId: 'confirm-end-roll-call',
    big: true,
    onYes: async (yes) => {
      yes.disabled = true
      rollMutation++
      try {
        rollCall = (await api.post(`/api/staff/rollcall/${encodeURIComponent(rollCall.id)}/end`)).roll_call
      } catch (err) {
        $('#roll-status').textContent = err.message
      }
      endConfirmOpen = false
      slot.replaceChildren()
      renderRoll()
      refreshRoll()
    },
    onCancel: () => { endConfirmOpen = false; slot.replaceChildren(); renderRoll() },
  }))
})

// ---------- shared lists (units for the pickers, residents for manual sign-in) ----------
async function loadStaffLists() {
  staffLists = await api.get('/api/staff/residents')
  const unitOptions = () => [h('option', { value: 'all' }, 'All units'), ...staffLists.units.map((u) => h('option', { value: u.id }, u.name))]
  fillSelect($('#log-unit'), unitOptions())
  fillSelect($('#contacts-unit'), unitOptions())
  return staffLists
}

// ---------- Day log ----------
let logDate = null

async function openLog() {
  try {
    if (!staffLists) await loadStaffLists()
    if (!logDate) { await loadInfo(); logDate = info.today }
    await loadLog()
  } catch (e) { showLoadError(e) }
}

async function loadLog() {
  const panel = $('#panel-day-log')
  clearErrors(panel)
  $('#log-date').value = logDate
  $('#log-next').disabled = !!info?.today && logDate >= info.today
  const unit = $('#log-unit').value || 'all'
  try {
    const data = await api.get(`/api/staff/visits?${api.qs({ date: logDate, unit })}`)
    $('#log-heading').textContent = `Day log · ${data.date_label}`
    $('#log-count').textContent = plural(data.count, 'visit')
    const tbody = $('#log-table tbody')
    tbody.replaceChildren(...(data.visits.length ? data.visits.map(logRow) : [h('tr', { class: 'empty-row' }, h('td', { colspan: 8 }, 'No visits on this day.'))]))
  } catch (e) {
    showError(panel, e, $('#log-error'))
  }
}

function logRow(v) {
  return h('tr', { 'data-log-visit': v.id },
    h('td', {}, v.in_label),
    h('td', { class: 'log-out' }, v.out_label ? [v.out_label, h('span', { class: 'kind' }, KIND_WORD[v.out_kind] || '')] : 'Still in'),
    h('td', {}, v.visitor_name),
    h('td', {}, v.visitor_phone || '—'),
    h('td', {}, v.resident.name),
    h('td', {}, v.resident.room),
    h('td', {}, v.unit.name),
    h('td', {}, v.method === 'staff' ? v.signed_in_by || 'Staff' : 'QR code'))
}

$('#log-prev').addEventListener('click', () => { if (logDate) { logDate = addDays(logDate, -1); loadLog() } })
$('#log-next').addEventListener('click', () => { if (logDate) { logDate = addDays(logDate, 1); loadLog() } })
$('#log-date').addEventListener('change', (e) => { if (e.target.value) { logDate = e.target.value; loadLog() } })
$('#log-unit').addEventListener('change', () => loadLog())

// ---------- Contact list ----------
async function openContacts() {
  try {
    if (!staffLists) await loadStaffLists()
    await loadInfo()
    if (!$('#contacts-from').value) $('#contacts-from').value = info.today
    if (!$('#contacts-to').value) $('#contacts-to').value = info.today
    $('#contacts-retention').textContent = `Visitor records are deleted after ${plural(info.retention_days, 'day')}.`
  } catch (e) { showLoadError(e) }
}

const contactsQuery = () => api.qs({ from: $('#contacts-from').value, to: $('#contacts-to').value, unit: $('#contacts-unit').value || 'all' })

$('#contacts-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const form = $('#contacts-form')
  clearErrors(form)
  $('#contacts-status').textContent = ''
  try {
    const data = await api.get(`/api/staff/contacts?${contactsQuery()}`)
    $('#contacts-count').textContent = plural(data.count, 'visit')
    $('#contacts-table tbody').replaceChildren(...(data.rows.length ? data.rows.map((r) => h('tr', { 'data-contact-row': r.visit_id },
      h('td', {}, r.date_label), h('td', {}, r.unit_name), h('td', {}, r.resident_name), h('td', {}, r.room), h('td', {}, r.visitor_name),
      h('td', {}, r.visitor_phone || '—'), h('td', {}, r.in_label), h('td', {}, r.out_label || ''), h('td', {}, r.signed_out), h('td', {}, r.signed_in_by)))
      : [h('tr', { class: 'empty-row' }, h('td', { colspan: 10 }, 'No visits in these dates.'))]))
  } catch (err) {
    // A refused Show leaves nothing from an earlier query under the new dates.
    $('#contacts-count').textContent = ''
    $('#contacts-table tbody').replaceChildren(h('tr', { class: 'empty-row' }, h('td', { colspan: 10 }, 'No list for these dates.')))
    showError(form, err, $('#contacts-error'))
  }
})

$('#download-contacts').addEventListener('click', async (e) => {
  const form = $('#contacts-form')
  const button = e.currentTarget
  clearErrors(form)
  $('#contacts-status').textContent = ''
  button.disabled = true
  try {
    const { filename } = await api.download(`/api/staff/contacts.csv?${contactsQuery()}`)
    $('#contacts-status').textContent = `Downloaded ${filename}`
  } catch (err) {
    showError(form, err, $('#contacts-error'))
  } finally {
    button.disabled = false
  }
})

// ---------- Sign someone in ----------
async function openManual() {
  const form = $('#manual-form')
  try {
    await loadStaffLists()
    const select = $('#manual-resident')
    const groups = staffLists.units.map((u) => h('optgroup', { label: u.restricted ? `${u.name} (visiting restricted)` : u.name },
      ...staffLists.residents.filter((r) => r.unit_id === u.id)
        .map((r) => h('option', { value: r.id }, `${r.name}, Room ${r.room}${r.by_arrangement ? ', by arrangement' : ''}`))))
    fillSelect(select, [h('option', { value: '' }, 'Pick a resident'), ...groups])
    const box = $('#manual-screening')
    if (staffLists.screening_enabled) {
      const start = await api.get('/api/visitor/start')
      $('#manual-questions').replaceChildren(...start.screening.questions.map((q) => h('li', { 'data-question': q.id }, q.text)))
      box.hidden = false
    } else {
      box.hidden = true
      $('#manual-screened').checked = false
    }
  } catch (e) {
    showError(form, e, $('#manual-error'))
  }
}

$('#manual-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const form = $('#manual-form')
  const submit = $('#manual-submit')
  clearErrors(form)
  $('#manual-result').textContent = ''
  $('#manual-warnings').hidden = true
  $('#manual-warnings').replaceChildren()
  const body = {
    resident_id: $('#manual-resident').value,
    visitor_name: $('#manual-name').value,
    visitor_phone: $('#manual-phone').value,
  }
  if (!$('#manual-screening').hidden && $('#manual-screened').checked) body.screened = true
  submit.disabled = true
  try {
    const { visit, warnings } = await api.post('/api/staff/visits', body)
    $('#manual-result').textContent = `Signed in ${visit.visitor_name} at ${visit.in_label}`
    if (warnings?.length) {
      $('#manual-warnings').replaceChildren(...warnings.map((w) => h('li', { 'data-warning': w.code }, w.message)))
      $('#manual-warnings').hidden = false
    }
    $('#manual-name').value = ''
    $('#manual-phone').value = ''
    $('#manual-screened').checked = false
  } catch (err) {
    showError(form, err, $('#manual-error'))
  } finally {
    submit.disabled = false
  }
})

// ---------- start ----------
;(async () => {
  try {
    await loadInfo()
  } catch (e) {
    $('#load-error').textContent = e.message
  }
  if (api.session.token()) showApp()
  else showKeypad()
})()
