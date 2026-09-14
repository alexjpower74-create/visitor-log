// Negative control (e) example-saves: the copy's Use the example also submits the screening form (saves).
// Passes only if settings-m1.spec.mjs "Use the example fills the form but saves nothing and leaves the switch off" goes red for that reason. Run: node tests/staff/negative-example-saves.mjs
import { staffNegative } from './negative-lib.mjs'

process.exit(staffNegative({
  name: "example-saves",
  why: "the copy's Use the example also submits the screening form (saves)",
  spec: "settings-m1.spec.mjs",
  grep: "Use the example fills the form but saves nothing and leaves the switch off",
  patches: [
    { file: "settings/settings.js", from: "  label.hidden = false\n  flash($('#screening-status'), '')", to: "  label.hidden = false\n  flash($('#screening-status'), '')\n  $('#screening-form').requestSubmit()" },
  ],
  expect: ["Use the example sent a save"],
}))
