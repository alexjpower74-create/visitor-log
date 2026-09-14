// The visitor's sign-in at the door (/): your details, who you are visiting, then the notices, screening and Sign in.
// Everything the page decides comes from docs/API.md; a "Yes" to a screening question stops here and sends nothing.
import { $, api, days, h, ME_KEY, noticeCard, paintHeader, showVisit, store, VISIT_KEY } from './visit.js'

const SHORT_SEARCH = 'Type at least 2 letters of their first name, or their room number.'
const NO_MATCH = "No one matches. Check the spelling, or ask at the nurse's desk."

const state = { start: null, step: 'details', searchSeq: 0, pickSeq: 0, resident: null, answers: {}, noticeConfirmed: false }
const steps = { details: $('#step-details'), search: $('#step-search'), resident: $('#step-resident') }
const error = $('#error')
const back = $('#back')
const signIn = $('#sign-in')
const unitNotices = $('#unit-notices')
const blocked = $('#blocked')
const blockedNotices = $('#blocked-notices')
const confirmNotice = $('#confirm-notice')
const screening = $('#screening')
const stop = $('#stop')

// ---------- steps and errors ----------

function go(step) {
  state.step = step
  for (const [name, section] of Object.entries(steps)) section.hidden = name !== step
  back.hidden = step === 'details'
  hideError()
  window.scrollTo(0, 0)
}

function hideError() {
  error.hidden = true
  error.textContent = ''
}

// The API's words, under the input the API named (or above Sign in).
function showError(message, field) {
  const anchor = { name: $('#name'), phone: $('#phone'), answers: screening, notice_confirmed: confirmNotice }[field]
  if (anchor && !anchor.hidden) anchor.after(error)
  else steps[state.step].append(error)
  if (state.step === 'resident' && !anchor) signIn.before(error)
  error.textContent = message
  error.hidden = false
}

back.addEventListener('click', () => {
  state.pickSeq++
  go(state.step === 'resident' ? 'search' : 'details')
})

// ---------- step 1: your details, remembered on this phone ----------

function tenDigits(raw) {
  return /^\d{10}$/.test(raw.replace(/[\s\-.()[\]]/g, '').replace(/^\+?1/, ''))
}

function remember(me) {
  store.set(ME_KEY, JSON.stringify(me))
  $('#not-you').hidden = false
}

$('#continue').addEventListener('click', () => {
  const name = $('#name').value.trim()
  const phone = $('#phone').value.trim()
  hideError()
  if (name.length < 2 || !/\p{L}/u.test(name)) return showError('Please type your name.', 'name')
  if (!tenDigits(phone)) return showError('Please type a 10-digit phone number, like 709-555-0123.', 'phone')
  remember({ name, phone })
  go('search')
  runSearch()
})

$('#not-you').addEventListener('click', () => {
  $('#name').value = ''
  $('#phone').value = ''
  store.remove(ME_KEY)
  $('#not-you').hidden = true
  hideError()
})

// ---------- step 2: who are you visiting? ----------

let searchTimer = null
$('#search').addEventListener('input', () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, 150)
})

async function runSearch() {
  const q = $('#search').value.trim()
  const seq = ++state.searchSeq
  const hint = $('#search-hint')
  const results = $('#results')
  if (q.length < 2) {
    results.replaceChildren()
    hint.textContent = SHORT_SEARCH
    hint.hidden = false
    return
  }
  const r = await api('GET', `/api/visitor/residents?q=${encodeURIComponent(q)}`)
  if (seq !== state.searchSeq) return
  if (!r.ok) {
    results.replaceChildren()
    hint.textContent = r.body.error
    hint.hidden = false
    return
  }
  hint.hidden = true
  if (!r.body.residents.length) {
    results.replaceChildren(h('p', { id: 'no-match' }, NO_MATCH))
    return
  }
  results.replaceChildren(...r.body.residents.map((res) => h('button', { type: 'button', class: 'resident', 'data-resident': res.id },
    h('span', { class: 'resident-name' }, res.name),
    h('span', { class: 'resident-where' }, `Room ${res.room} · ${res.unit.name}`))))
}

$('#results').addEventListener('click', (e) => {
  const button = e.target.closest('button.resident')
  if (button) pick(button.dataset.resident)
})

// ---------- step 3: the resident, notices, screening, Sign in ----------

function paintAnswers() {
  for (const button of screening.querySelectorAll('button.answer')) {
    const qid = button.closest('.question').dataset.question
    button.setAttribute('aria-pressed', state.answers[qid] === button.dataset.answer ? 'true' : 'false')
  }
}

function refreshSignIn() {
  const d = state.resident
  const questions = state.start.screening.enabled ? state.start.screening.questions : []
  const allNo = questions.every((q) => state.answers[q.id] === 'no')
  const confirmed = !d?.needs_notice_confirm || state.noticeConfirmed
  signIn.disabled = !(d && d.can_sign_in && allNo && confirmed)
}

async function pick(id) {
  const seq = ++state.pickSeq
  // A different resident: clear the last one's notices, refusal, answers and confirmation before anything new is shown.
  unitNotices.replaceChildren()
  unitNotices.hidden = true
  blockedNotices.replaceChildren()
  blocked.hidden = true
  state.resident = null
  state.answers = {}
  state.noticeConfirmed = false
  confirmNotice.setAttribute('aria-pressed', 'false')
  confirmNotice.hidden = true
  stop.hidden = true
  screening.hidden = true
  signIn.hidden = true
  paintAnswers()
  $('#resident-name').textContent = ''
  $('#resident-where').textContent = ''
  go('resident')
  $('#resident-loading').hidden = false

  const r = await api('GET', `/api/visitor/residents/${encodeURIComponent(id)}`)
  if (seq !== state.pickSeq) return
  $('#resident-loading').hidden = true
  if (!r.ok) return showError(r.body.error)
  const d = r.body
  state.resident = d
  $('#resident-name').textContent = d.resident.name
  $('#resident-where').textContent = `Room ${d.resident.room} · ${d.resident.unit.name}`
  if (!d.can_sign_in) {
    $('#blocked-message').textContent = d.message
    blockedNotices.append(...d.unit_notices.map(noticeCard))
    blocked.hidden = false
    return
  }
  unitNotices.append(...d.unit_notices.map(noticeCard))
  unitNotices.hidden = d.unit_notices.length === 0
  confirmNotice.hidden = !d.needs_notice_confirm
  screening.hidden = !state.start.screening.enabled
  signIn.hidden = false
  refreshSignIn()
}

$('#pick-else').addEventListener('click', () => {
  state.pickSeq++
  go('search')
})

confirmNotice.addEventListener('click', () => {
  state.noticeConfirmed = !state.noticeConfirmed
  confirmNotice.setAttribute('aria-pressed', state.noticeConfirmed ? 'true' : 'false')
  hideError()
  refreshSignIn()
})

function showStop(message) {
  $('#stop-message').textContent = message
  stop.hidden = false
  signIn.hidden = true
}

function answer(qid, value) {
  state.answers[qid] = value
  paintAnswers()
  hideError()
  if (value === 'yes') {
    // A "Yes" stops the sign-in here, in the home's own words, and nothing is sent.
    showStop(state.start.screening.stop_message)
    return
  }
  refreshSignIn()
}

screening.addEventListener('click', (e) => {
  const button = e.target.closest('button.answer')
  if (button) answer(button.closest('.question').dataset.question, button.dataset.answer)
})

$('#stop-back').addEventListener('click', () => {
  state.answers = {}
  paintAnswers()
  stop.hidden = true
  signIn.hidden = false
  refreshSignIn()
})

async function submit() {
  const d = state.resident
  const body = { name: $('#name').value, phone: $('#phone').value, resident_id: d.resident.id }
  if (state.start.screening.enabled) body.answers = { ...state.answers }
  if (d.needs_notice_confirm) body.notice_confirmed = state.noticeConfirmed
  signIn.disabled = true
  hideError()
  const r = await api('POST', '/api/visitor/signin', body)
  if (r.ok) {
    store.set(VISIT_KEY, r.body.token)
    history.replaceState(null, '', r.body.out_url)
    return openVisit(r.body.visit, r.body.token)
  }
  refreshSignIn()
  const { code, field, error: message } = r.body
  if (code === 'screening_stop') return showStop(message)
  if (field === 'name' || field === 'phone') {
    go('details')
    return showError(message, field)
  }
  showError(message, field)
}

signIn.addEventListener('click', submit)

function openVisit(visit, token) {
  $('#flow').remove()
  $('#home-notices').remove()
  showVisit(visit, token)
}

// ---------- start ----------

function renderQuestions() {
  const answerButton = (value, label) => h('button', { type: 'button', class: 'v-button answer', 'data-answer': value, 'aria-pressed': 'false' }, label)
  $('#questions').replaceChildren(...state.start.screening.questions.map((q) => h('div', { class: 'question', 'data-question': q.id },
    h('p', { class: 'question-text' }, q.text),
    h('div', { class: 'answers' }, answerButton('no', 'No'), answerButton('yes', 'Yes')))))
}

async function boot() {
  const s = await api('GET', '/api/visitor/start')
  $('#loading').hidden = true
  if (!s.ok) {
    $('#flow').hidden = false
    return showError(s.body.error)
  }
  state.start = s.body
  paintHeader(s.body)
  $('#retention-days').textContent = days(s.body.retention_days)
  $('#home-notices').replaceChildren(...s.body.home_notices.map(noticeCard))
  renderQuestions()

  // A visit still in on this phone: show it (the page moves to its sign-out link).
  const token = store.get(VISIT_KEY)
  if (token) {
    const r = await api('GET', `/api/visit/${encodeURIComponent(token)}`)
    if (r.ok && r.body.visit.state === 'in') {
      history.replaceState(null, '', `/out/?t=${token}`)
      return openVisit(r.body.visit, token)
    }
    store.remove(VISIT_KEY)
  }

  let me = null
  try { me = JSON.parse(store.get(ME_KEY) || 'null') } catch {}
  if (me && (me.name || me.phone)) {
    $('#name').value = me.name || ''
    $('#phone').value = me.phone || ''
    $('#not-you').hidden = false
  }
  $('#flow').hidden = false
  go('details')
}

boot()
