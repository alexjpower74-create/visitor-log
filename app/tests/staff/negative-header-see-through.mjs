// Negative control (fix 1) header-see-through: the copy puts back the M1b translucent header background rgba(11, 16, 32, 0.78).
// Passes only if targets.spec.mjs "the sticky header is opaque and a Sign out scrolled under it can still be tapped" goes red for that reason. Run: node tests/staff/negative-header-see-through.mjs
import { staffNegative } from './negative-lib.mjs'

process.exit(staffNegative({
  name: "header-see-through",
  why: "the copy puts back the M1b translucent header background rgba(11, 16, 32, 0.78)",
  spec: "targets.spec.mjs",
  grep: "the sticky header is opaque and a Sign out scrolled under it can still be tapped",
  project: "chromium-390",
  patches: [
    { file: "common/style.css", from: "  background: var(--ground); /* opaque: a row scrolled under the header must not read through it */", to: "  background: rgba(11, 16, 32, 0.78);" },
  ],
  expect: ["the sticky header is opaque"],
}))
