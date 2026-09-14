// Settings (manager only): Notices, Screening, Visits and privacy, Units and hours, Residents, Staff, Door sign.
// Every write answers with the whole settings object (docs/API.md); lists re-render from it, forms being typed in are left alone.
import * as api from '/common/api.js'
import { h, $, $$, plural, noticeCard, homeLine, paintClock, timeText, collapsedSection, mountTabs, clearErrors, showError, confirmBox, poller, fillSelect } from '/common/ui.js'
import { mountKeypad } from '/common/keypad.js'
import { drawQr } from '/common/qr.js'

const TABS = [
  { id: 'notices', label: 'Notices' },
  { id: 'screening', label: 'Screening' },
  { id: 'visits', label: 'Visits and privacy' },
  { id: 'units', label: 'Units and hours' },
  { id: 'residents', label: 'Residents' },
  { id: 'staff', label: 'Staff' },
  { id: 'door-sign', label: 'Door sign' },
]
const SEVERITY_HELP = {
  info: 'Visitors see your message.',
  restricted: "Visitors see your message and can't sign themselves in; they are sent to the nurse's desk.",
  outbreak: 'Visitors see your message and must tap I have read it before they sign in.',
}
// The example from docs/API.md. It fills the form only; the app never saves it or switches screening on.
const EXAMPLE = {
  label: "Example only. Change the words to your home's own before you turn screening on.",
  questions: [
    'Do you feel sick today, for example with a fever, cough, vomiting or diarrhea?',
    'Has public health or a doctor told you to stay home right now?',
  ],
  stop_message: "Please don't visit today. Call the unit if you need to talk with someone.",
}
const MAX_QUESTIONS = 10
const MAX_WINDOWS = 4

let info = null
let settings = null
let tabs = null
let keypad = null

const setClock = (i) => paintClock($('#clock'), i?.date_label, i?.time_label)
async function loadInfo() {
  info = await api.get('/api/info')
  $('#header-home').replaceWith(Object.assign(homeLine(info), { id: 'header-home' }))
  setClock(info)
}
const clockPoll = poller(async () => { info = await api.get('/api/info'); setClock(info) }, 30000)

$('#staff-link').href = api.withMock('/staff/')
$('#door-sign-link').href = api.withMock('/settings/door-sign/')

// ---------- sign in ----------
function showKeypad(message) {
  $('#app').hidden = true
  $('#settings-signout').hidden = true
  $('#who-name').textContent = ''
  const root = $('#signin')
  root.hidden = false
  keypad?.destroy()
  keypad = mountKeypad(root, {
    title: 'Manager sign in',
    intro: 'Settings need a manager’s PIN. Tap it, then Enter.',
    onSubmit: async (pin) => {
      try {
        await api.signIn(pin)
        settings = (await api.get('/api/settings')).settings
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
  $('#settings-signout').hidden = false
  $('#who-name').textContent = api.session.who()?.name || ''
  renderAll()
  fillScreeningForm()
  fillVisitsForm()
  resetUnitForm()
  resetResidentForm()
  resetStaffForm()
  if (!tabs) {
    tabs = mountTabs($('#tabs'), TABS, (id) => { if (id === 'door-sign') renderDoorPreview() })
    tabs.select(tabs.initial)
  }
  clockPoll.start({ now: false })
}

$('#settings-signout').addEventListener('click', async () => {
  await api.signOut()
  showKeypad()
})
window.addEventListener(api.SIGNED_OUT_EVENT, () => showKeypad('Please sign in again.'))

/** Apply a write's answer: keep the new settings and re-render the lists. */
function applySettings(next) {
  settings = next
  renderAll()
}

function renderAll() {
  renderNoticeForm()
  renderNotices()
  renderRetentionLine()
  renderUnits()
  renderResidents()
  renderStaff()
}

const unitName = (id) => settings.units.find((u) => u.id === id)?.name || ''
const activeUnits = () => settings.units.filter((u) => u.active)
/** A saved-for-a-moment note beside a form's Save button. */
function flash(el, text) {
  el.textContent = text
  clearTimeout(el._t)
  el._t = setTimeout(() => { el.textContent = '' }, 6000)
}

// ---------- Notices ----------
function renderNoticeForm() {
  fillSelect($('#notice-unit'), [h('option', { value: '' }, 'Whole home'), ...activeUnits().map((u) => h('option', { value: u.id }, u.name))])
  $('#notice-severity-help').textContent = SEVERITY_HELP[$('#notice-severity').value]
}
$('#notice-severity').addEventListener('change', () => { $('#notice-severity-help').textContent = SEVERITY_HELP[$('#notice-severity').value] })

$('#notice-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const form = e.currentTarget
  clearErrors(form)
  const button = $('#notice-add')
  button.disabled = true
  try {
    const unit = $('#notice-unit').value
    const answer = await api.post('/api/settings/notices', {
      unit_id: unit === '' ? null : unit,
      severity: $('#notice-severity').value,
      message: $('#notice-message').value,
    })
    $('#notice-message').value = ''
    applySettings(answer.settings)
    flash($('#notice-status'), 'Notice added. Visitors see it now.')
  } catch (err) {
    showError(form, err, $('#notice-error'))
  } finally {
    button.disabled = false
  }
})

function renderNotices() {
  const list = $('#notice-list')
  if (!settings.notices.length) {
    list.replaceChildren(h('p', { class: 'muted' }, 'No notices. Visitors see none.'))
    return
  }
  list.replaceChildren(...settings.notices.map((n) => {
    const error = h('p', { class: 'row-error', role: 'alert' })
    const toggle = h('button', { type: 'button', class: 'notice-toggle', 'aria-pressed': n.active ? 'true' : 'false', 'aria-label': `Show this notice: ${n.active ? 'On' : 'Off'}` }, n.active ? 'On' : 'Off')
    const remove = h('button', { type: 'button', class: 'notice-remove' }, 'Remove')
    const slot = h('div', { class: 'row-slot', style: 'flex-basis:100%' })
    const row = h('div', { class: `list-row notice-row${n.active ? '' : ' inactive'}`, 'data-notice-row': n.id },
      h('div', { class: 'grow' }, noticeCard(n), h('p', { class: 'small muted' }, `Added ${n.created_label}${n.active ? '' : ' · Off: visitors and staff do not see it'}`)),
      toggle, remove, slot, error)
    toggle.addEventListener('click', async () => {
      toggle.disabled = true
      try { applySettings((await api.put(`/api/settings/notices/${encodeURIComponent(n.id)}`, { active: !n.active })).settings) } catch (err) { error.textContent = err.message; toggle.disabled = false }
    })
    remove.addEventListener('click', () => {
      remove.hidden = true
      slot.replaceChildren(confirmBox({
        text: 'Remove this notice for good?',
        yesLabel: 'Yes, remove',
        yesClass: 'confirm-remove',
        onYes: async (yes) => {
          yes.disabled = true
          try { applySettings((await api.del(`/api/settings/notices/${encodeURIComponent(n.id)}`)).settings) } catch (err) { error.textContent = err.message; slot.replaceChildren(); remove.hidden = false }
        },
        onCancel: () => { slot.replaceChildren(); remove.hidden = false },
      }))
    })
    return row
  }))
}

// ---------- Screening ----------
const screeningSwitch = $('#screening-enabled')
function setSwitch(on) {
  screeningSwitch.setAttribute('aria-checked', on ? 'true' : 'false')
  screeningSwitch.querySelector('.switch-state').textContent = on ? 'On' : 'Off'
}
screeningSwitch.addEventListener('click', () => setSwitch(screeningSwitch.getAttribute('aria-checked') !== 'true'))

function questionRow(q = { text: '' }) {
  const input = h('input', { type: 'text', class: 'question-text', maxlength: 200, autocomplete: 'off', value: q.text })
  const remove = h('button', { type: 'button', class: 'question-remove' }, 'Remove')
  const row = h('div', { class: 'question-row', 'data-question-id': q.id || '' }, h('label', {}, 'Question'), input, remove)
  remove.addEventListener('click', () => { row.remove(); numberQuestions() })
  return row
}
function numberQuestions() {
  const rows = $$('#question-list .question-row')
  rows.forEach((row, i) => {
    const id = `question-${i + 1}`
    row.querySelector('input').id = id
    row.querySelector('input').name = `questions.${i}`
    const label = row.querySelector('label')
    label.htmlFor = id
    label.textContent = `Question ${i + 1}`
  })
  $('#question-add').disabled = rows.length >= MAX_QUESTIONS
  const list = $('#question-list')
  list.querySelector('.question-empty')?.remove()
  if (!rows.length) list.append(h('p', { class: 'question-empty' }, 'No questions yet.'))
}
function setQuestions(questions) {
  $('#question-list').replaceChildren(...questions.map(questionRow))
  numberQuestions()
}

function fillScreeningForm() {
  setSwitch(settings.home.screening_enabled)
  setQuestions(settings.screening_questions)
  $('#screening-stop').value = settings.home.screening_stop_message || ''
  $('#example-label').hidden = true
}

$('#question-add').addEventListener('click', () => {
  const row = questionRow()
  $('#question-list').append(row)
  numberQuestions()
  row.querySelector('input').focus()
})

$('#use-example').addEventListener('click', () => {
  clearErrors($('#screening-form'))
  setQuestions(EXAMPLE.questions.map((text) => ({ text })))
  $('#screening-stop').value = EXAMPLE.stop_message
  const label = $('#example-label')
  label.textContent = EXAMPLE.label
  label.hidden = false
  flash($('#screening-status'), '')
})

$('#screening-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const form = e.currentTarget
  clearErrors(form)
  const button = $('#screening-save')
  button.disabled = true
  try {
    const questions = $$('#question-list .question-row').map((row) => {
      const q = { text: row.querySelector('input').value }
      if (row.dataset.questionId) q.id = row.dataset.questionId
      return q
    })
    const answer = await api.put('/api/settings/screening', {
      enabled: screeningSwitch.getAttribute('aria-checked') === 'true',
      stop_message: $('#screening-stop').value,
      questions,
    })
    applySettings(answer.settings)
    fillScreeningForm()
    flash($('#screening-status'), answer.settings.home.screening_enabled ? 'Saved. Visitors are asked these questions now.' : 'Saved. Screening is off.')
  } catch (err) {
    showError(form, err, $('#screening-error'))
  } finally {
    button.disabled = false
  }
})

// ---------- Visits and privacy ----------
const intOrRaw = (v) => (/^\s*-?\d+\s*$/.test(v) ? Number(v) : v)

function fillVisitsForm() {
  const home = settings.home
  $('#retention-days').value = home.retention_days
  $('#max-visitors').value = home.max_visitors_per_resident ?? ''
  $('#after-hours-message').value = home.after_hours_message
  $('#desk-message').value = home.desk_message
  $('#home-phone').value = home.phone
}
function renderRetentionLine() {
  $('#retention-line').textContent = `Visitor records are deleted after ${plural(settings.home.retention_days, 'day')}.`
}

$('#visits-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const form = e.currentTarget
  clearErrors(form)
  const button = $('#visits-save')
  button.disabled = true
  try {
    const max = $('#max-visitors').value.trim()
    const answer = await api.put('/api/settings/home', {
      retention_days: intOrRaw($('#retention-days').value),
      max_visitors_per_resident: max === '' ? null : intOrRaw(max),
      after_hours_message: $('#after-hours-message').value,
      desk_message: $('#desk-message').value,
      phone: $('#home-phone').value,
    })
    applySettings(answer.settings)
    fillVisitsForm()
    flash($('#visits-status'), 'Saved.')
  } catch (err) {
    showError(form, err, $('#visits-error'))
  } finally {
    button.disabled = false
  }
})

// ---------- Units and hours ----------
let editingUnit = null

function renderUnits() {
  const unitRow = (u) => {
    const error = h('p', { class: 'row-error', role: 'alert' })
    const slot = h('div', { class: 'row-slot', style: 'flex-basis:100%' })
    const edit = h('button', { type: 'button', class: 'unit-edit' }, 'Change')
    const close = u.active
      ? h('button', { type: 'button', class: 'unit-close' }, 'Close this unit')
      : h('button', { type: 'button', class: 'unit-reopen' }, 'Put back')
    const row = h('div', { class: `list-row${u.active ? '' : ' inactive'}`, 'data-unit-row': u.id },
      h('div', { class: 'grow' },
        h('p', {}, h('strong', {}, u.name), u.active ? null : h('span', { class: 'pill', style: 'margin-left:8px' }, 'Closed')),
        h('p', { class: 'muted small unit-hours-label' }, ...timeText(u.hours_label))),
      u.active ? edit : null, close, slot, error)
    edit.addEventListener('click', () => startUnitEdit(u))
    close.addEventListener('click', () => {
      if (!u.active) return putUnit(u.id, { active: true }, error)
      close.hidden = true
      slot.replaceChildren(confirmBox({
        text: `Close ${u.name}? Visitors can no longer pick it.`,
        yesLabel: 'Yes, close it',
        yesClass: 'confirm-close',
        onYes: async (yes) => { yes.disabled = true; if (!(await putUnit(u.id, { active: false }, error))) { slot.replaceChildren(); close.hidden = false } },
        onCancel: () => { slot.replaceChildren(); close.hidden = false },
      }))
    })
    return row
  }
  const list = [...settings.units.filter((u) => u.active).map(unitRow),
    collapsedSection('units-closed', 'Closed', settings.units.filter((u) => !u.active).map(unitRow))]
  $('#unit-list').replaceChildren(...list.filter(Boolean))
}

async function putUnit(id, body, errorEl) {
  try {
    applySettings((await api.put(`/api/settings/units/${encodeURIComponent(id)}`, body)).settings)
    return true
  } catch (err) {
    errorEl.textContent = err.message
    return false
  }
}

// A time input cannot hold 24:00; the page shows midnight at the end of the day as 00:00 and sends it as 24:00.
const closeToInput = (v) => (v === '24:00' ? '00:00' : v)
const closeFromInput = (v) => (v === '00:00' ? '24:00' : v)

function windowRow(w = { open: '', close: '' }) {
  const open = h('input', { type: 'time', class: 'window-open', value: w.open })
  const close = h('input', { type: 'time', class: 'window-close', value: closeToInput(w.close) })
  const remove = h('button', { type: 'button', class: 'window-remove' }, 'Remove')
  const row = h('div', { class: 'window' },
    h('div', { class: 'time-field' }, h('label', {}, 'From'), open),
    h('div', { class: 'time-field' }, h('label', {}, 'To'), close),
    remove)
  remove.addEventListener('click', () => { row.remove(); numberWindows() })
  return row
}
function numberWindows() {
  const rows = $$('#unit-windows .window')
  rows.forEach((row, i) => {
    const [openLabel, closeLabel] = row.querySelectorAll('label')
    const open = row.querySelector('.window-open')
    const close = row.querySelector('.window-close')
    open.id = `window-open-${i + 1}`
    close.id = `window-close-${i + 1}`
    openLabel.htmlFor = open.id
    closeLabel.htmlFor = close.id
    openLabel.textContent = rows.length > 1 ? `Time ${i + 1}: from` : 'From'
    closeLabel.textContent = 'To'
    row.querySelector('.window-remove').hidden = rows.length < 2
  })
  $('#window-add').disabled = rows.length >= MAX_WINDOWS
}
function setWindows(hours) {
  $('#unit-windows').replaceChildren(...hours.map(windowRow))
  numberWindows()
}

function resetUnitForm() {
  editingUnit = null
  $('#unit-form-title').textContent = 'Add a unit'
  $('#unit-name').value = ''
  setWindows([{ open: '', close: '' }])
  $('#unit-cancel').hidden = true
  clearErrors($('#unit-form'))
}
function startUnitEdit(u) {
  editingUnit = u.id
  $('#unit-form-title').textContent = `Change ${u.name}`
  $('#unit-name').value = u.name
  setWindows(u.hours)
  $('#unit-cancel').hidden = false
  clearErrors($('#unit-form'))
  $('#unit-name').focus()
}
$('#unit-cancel').addEventListener('click', resetUnitForm)
$('#window-add').addEventListener('click', () => {
  $('#unit-windows').append(windowRow())
  numberWindows()
})
$('#unit-all-day').addEventListener('click', () => setWindows([{ open: '00:00', close: '24:00' }]))

$('#unit-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const form = e.currentTarget
  clearErrors(form)
  const button = $('#unit-save')
  button.disabled = true
  const body = {
    name: $('#unit-name').value,
    hours: $$('#unit-windows .window').map((row) => ({ open: row.querySelector('.window-open').value, close: closeFromInput(row.querySelector('.window-close').value) })),
  }
  try {
    const answer = editingUnit
      ? await api.put(`/api/settings/units/${encodeURIComponent(editingUnit)}`, body)
      : await api.post('/api/settings/units', body)
    applySettings(answer.settings)
    const was = editingUnit
    resetUnitForm()
    flash($('#unit-status'), was ? 'Saved.' : 'Unit added.')
  } catch (err) {
    showError(form, err, $('#unit-error'))
  } finally {
    button.disabled = false
  }
})

// ---------- Residents ----------
let editingResident = null

function renderResidents() {
  fillSelect($('#resident-unit'), activeUnits().map((u) => h('option', { value: u.id }, u.name)))
  const active = settings.residents.filter((r) => r.active)
  const removed = settings.residents.filter((r) => !r.active)
  $('#resident-count').textContent = plural(active.length, 'resident')
  const residentRow = (r) => {
    const error = h('p', { class: 'row-error', role: 'alert' })
    const slot = h('div', { class: 'row-slot', style: 'flex-basis:100%' })
    const edit = h('button', { type: 'button', class: 'resident-edit' }, 'Change')
    const remove = h('button', { type: 'button', class: 'resident-remove' }, 'Remove')
    const restore = h('button', { type: 'button', class: 'resident-restore' }, 'Put back')
    restore.addEventListener('click', async () => {
      restore.disabled = true
      try { applySettings((await api.put(`/api/settings/residents/${encodeURIComponent(r.id)}`, { active: true })).settings) } catch (err) { error.textContent = err.message; restore.disabled = false }
    })
    const row = h('div', { class: 'list-row', 'data-resident-row': r.id },
      h('div', { class: 'grow' },
        h('p', {}, h('strong', { class: 'resident-name' }, r.name)),
        h('div', { class: 'tags' },
          h('span', { class: 'muted' }, `Room ${r.room} · ${unitName(r.unit_id)}`),
          r.by_arrangement ? h('span', { class: 'pill staff-tag' }, 'By arrangement') : null)),
      ...(r.active ? [edit, remove, slot] : [restore]), error)
    edit.addEventListener('click', () => startResidentEdit(r))
    remove.addEventListener('click', () => {
      remove.hidden = true
      slot.replaceChildren(confirmBox({
        text: `Remove ${r.name}? Visitors can no longer find them.`,
        yesLabel: 'Yes, remove',
        yesClass: 'confirm-remove-resident',
        onYes: async (yes) => {
          yes.disabled = true
          try { applySettings((await api.put(`/api/settings/residents/${encodeURIComponent(r.id)}`, { active: false })).settings); if (editingResident === r.id) resetResidentForm() } catch (err) { error.textContent = err.message; slot.replaceChildren(); remove.hidden = false }
        },
        onCancel: () => { slot.replaceChildren(); remove.hidden = false },
      }))
    })
    return row
  }
  const list = [...(active.length ? active.map(residentRow) : [h('p', { class: 'muted' }, 'No residents yet.')]),
    collapsedSection('residents-removed', 'Removed', removed.map(residentRow))]
  $('#resident-list').replaceChildren(...list.filter(Boolean))
}

function resetResidentForm() {
  editingResident = null
  $('#resident-form-title').textContent = 'Add a resident'
  for (const id of ['#resident-first', '#resident-initial', '#resident-room']) $(id).value = ''
  $('#resident-arrangement').checked = false
  $('#resident-cancel').hidden = true
  clearErrors($('#resident-form'))
}
function startResidentEdit(r) {
  editingResident = r.id
  $('#resident-form-title').textContent = `Change ${r.name}`
  $('#resident-first').value = r.first_name
  $('#resident-initial').value = r.last_initial
  $('#resident-room').value = r.room
  $('#resident-unit').value = r.unit_id
  $('#resident-arrangement').checked = r.by_arrangement
  $('#resident-cancel').hidden = false
  clearErrors($('#resident-form'))
  $('#resident-first').focus()
}
$('#resident-cancel').addEventListener('click', resetResidentForm)

$('#resident-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const form = e.currentTarget
  clearErrors(form)
  const button = $('#resident-save')
  button.disabled = true
  const body = {
    first_name: $('#resident-first').value,
    last_initial: $('#resident-initial').value,
    room: $('#resident-room').value,
    unit_id: $('#resident-unit').value,
    by_arrangement: $('#resident-arrangement').checked,
  }
  try {
    const answer = editingResident
      ? await api.put(`/api/settings/residents/${encodeURIComponent(editingResident)}`, body)
      : await api.post('/api/settings/residents', body)
    applySettings(answer.settings)
    const was = editingResident
    resetResidentForm()
    flash($('#resident-status'), was ? 'Saved.' : 'Resident added.')
  } catch (err) {
    showError(form, err, $('#resident-error'))
  } finally {
    button.disabled = false
  }
})

// ---------- Staff ----------
let editingStaff = null
const ROLE_WORD = { manager: 'Manager', staff: 'Staff' }

function renderStaff() {
  const staffRow = (m) => {
    const error = h('p', { class: 'row-error', role: 'alert' })
    const edit = h('button', { type: 'button', class: 'staff-edit' }, 'Change')
    const toggle = h('button', { type: 'button', class: 'staff-toggle' }, m.active ? 'Turn off' : 'Turn on')
    const row = h('div', { class: `list-row${m.active ? '' : ' inactive'}`, 'data-staff-row': m.id },
      h('div', { class: 'grow' },
        h('p', {}, h('strong', {}, m.name)),
        h('div', { class: 'tags' }, h('span', { class: 'muted' }, ROLE_WORD[m.role] || m.role), m.active ? null : h('span', { class: 'pill' }, 'Off: this PIN does not work'))),
      m.active ? edit : null, toggle, error)
    edit.addEventListener('click', () => startStaffEdit(m))
    toggle.addEventListener('click', async () => {
      toggle.disabled = true
      try {
        applySettings((await api.put(`/api/settings/staff/${encodeURIComponent(m.id)}`, { active: !m.active })).settings)
      } catch (err) {
        error.textContent = err.message
        toggle.disabled = false
      }
    })
    return row
  }
  const list = [...settings.staff.filter((m) => m.active).map(staffRow),
    collapsedSection('staff-off', 'Turned off', settings.staff.filter((m) => !m.active).map(staffRow))]
  $('#staff-list').replaceChildren(...list.filter(Boolean))
}

function resetStaffForm() {
  editingStaff = null
  $('#staff-form-title').textContent = 'Add a staff member'
  $('#staff-name').value = ''
  $('#staff-role').value = 'staff'
  $('#staff-pin').value = ''
  $('#staff-pin-hint').textContent = '4 to 6 digits, different for each person'
  $('#staff-cancel').hidden = true
  clearErrors($('#staff-form'))
}
function startStaffEdit(m) {
  editingStaff = m.id
  $('#staff-form-title').textContent = `Change ${m.name}`
  $('#staff-name').value = m.name
  $('#staff-role').value = m.role
  $('#staff-pin').value = ''
  $('#staff-pin-hint').textContent = 'Leave blank to keep their PIN'
  $('#staff-cancel').hidden = false
  clearErrors($('#staff-form'))
  $('#staff-name').focus()
}
$('#staff-cancel').addEventListener('click', resetStaffForm)

$('#staff-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const form = e.currentTarget
  clearErrors(form)
  const button = $('#staff-save')
  button.disabled = true
  const body = { name: $('#staff-name').value, role: $('#staff-role').value }
  const pin = $('#staff-pin').value
  if (!editingStaff || pin !== '') body.pin = pin
  try {
    const answer = editingStaff
      ? await api.put(`/api/settings/staff/${encodeURIComponent(editingStaff)}`, body)
      : await api.post('/api/settings/staff', body)
    applySettings(answer.settings)
    const was = editingStaff
    resetStaffForm()
    flash($('#staff-status'), was ? 'Saved.' : 'Staff member added.')
  } catch (err) {
    showError(form, err, $('#staff-error'))
  } finally {
    button.disabled = false
  }
})

// ---------- Door sign ----------
function renderDoorPreview() {
  const url = `${location.origin}/`
  $('.door-preview-home').textContent = settings?.home.home_name || info?.home_name || ''
  $('.door-preview-url').textContent = url
  drawQr($('.qr-preview'), url, { size: 200 })
}

// ---------- start ----------
;(async () => {
  try {
    await loadInfo()
  } catch (e) {
    $('#load-error').textContent = e.message
  }
  if (!api.session.token()) return showKeypad()
  try {
    settings = (await api.get('/api/settings')).settings
    showApp()
  } catch (e) {
    showKeypad(e.status === 401 ? 'Please sign in again.' : e.message)
  }
})()
