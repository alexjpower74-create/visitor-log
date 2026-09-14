// Negative control (M4) total-starts-at-zero: the copy starts the total at 0 again, both in the page's starting text and where the
// keypad screen resets it (the first version of this control changed only the HTML; the keypad reset still wrote "…" before sign-in,
// so the test stayed green and the control was recorded NOT RED).
// Passes only if building.spec.mjs "before the first building answer the total shows no number, then the API total" goes red for that
// reason. Run: node tests/staff/negative-total-starts-at-zero.mjs
import { staffNegative } from './negative-lib.mjs'

process.exit(staffNegative({
  name: "total-starts-at-zero",
  why: "the copy starts the total at 0 again (page text and the keypad reset), as M2 did",
  spec: "building.spec.mjs",
  grep: "before the first building answer the total shows no number, then the API total",
  patches: [
    { file: "staff/index.html", from: "<span class=\"total-number\">…</span>", to: "<span class=\"total-number\">0</span>" },
    { file: "staff/staff.js", from: "$('#building-total').replaceChildren(h('span', { class: 'total-number' }, '…'), ' in the building')", to: "$('#building-total').replaceChildren(h('span', { class: 'total-number' }, '0'), ' in the building')" },
  ],
  expect: ["no number before the first answer"],
}))
