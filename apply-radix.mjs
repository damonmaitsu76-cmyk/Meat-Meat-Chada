// Run from the project root:  node apply-radix.mjs
// Swaps the hand-built modals and the browser's confirm()/prompt() for the Radix dialogs.
// Each file is changed only if every edit for it fits; otherwise it is left untouched and listed.
import fs from 'node:fs'

const SUPA = /import \{ supabase \} from '\.\.\/\.\.\/supabaseClient\.js'\n/
const ESC = /\n?[ \t]*useEffect\(\(\) => \{\s*const onKey = \(e\) => \{\s*if \(e\.key === 'Escape'\) onClose\(\)\s*\}\s*window\.addEventListener\('keydown', onKey\)\s*return \(\) => window\.removeEventListener\('keydown', onKey\)\s*\}, \[onClose\]\)\n/
const OPEN = /<div className="backdrop" onClick=\{onClose\}>\s*<div\s+className="modal"[\s\S]*?<div className="modal-head">[\s\S]*?<\/div>\s*/
const TABLE_TITLE = '<Modal title={`Table ${table.table_number}`} onClose={onClose}>\n        '

const imports = (...lines) => ({
  name: 'imports',
  find: SUPA,
  replace: (m) => m + lines.join('\n') + '\n',
})
const modalImport = "import Modal from '../../components/Modal.jsx'"
const dialogImport = (names) => `import { ${names} } from '../../components/dialogs.js'`

const plan = {
  'src/main.jsx': [
    {
      name: 'import host',
      find: /import App from '\.\/App\.jsx'\n/,
      replace: (m) => m + "import DialogHost from './components/DialogHost.jsx'\n",
    },
    {
      name: 'mount host',
      find: /( *)<App \/>\n/,
      replace: (m, sp) => `${m}${sp}<DialogHost />\n`,
    },
  ],
  'src/pages/staff/Dashboard.jsx': [
    imports(modalImport),
    { name: 'remove Escape handler', find: ESC, replace: () => '\n' },
    { name: 'modal opening', find: OPEN, replace: () => TABLE_TITLE },
    {
      name: 'modal closing',
      find: /(\{error && \(\s*<p className="error" style=\{\{ marginTop: 14 \}\}>\s*\{error\}\s*<\/p>\s*\)\})\s*<\/div>\s*<\/div>/,
      replace: (m, keep) => `${keep}\n    </Modal>`,
    },
  ],
  'src/pages/staff/TableManagement.jsx': [
    imports(modalImport, dialogImport('confirmDialog')),
    { name: 'remove Escape handler', find: ESC, replace: () => '\n' },
    { name: 'modal opening', find: OPEN, replace: () => TABLE_TITLE },
    {
      name: 'modal closing',
      find: /(Print\s*<\/button>\s*<\/div>\s*\)\}\s*<\/div>)\s*<\/div>\s*<\/div>/,
      replace: (m, keep) => `${keep}\n    </Modal>`,
    },
    {
      name: 'confirm remove table',
      find: /!window\.confirm\(\s*`Remove Table \$\{t\.table_number\}\? It leaves the floor view and its QR code stops working\. Past records are kept\.`\s*\)/,
      replace: () =>
        "!(await confirmDialog({\n        title: `Remove Table ${t.table_number}?`,\n        message: 'It leaves the floor view and its QR code stops working. Past records are kept.',\n        confirmLabel: 'Remove table',\n      }))",
    },
  ],
  'src/pages/staff/StaffAccounts.jsx': [
    imports(modalImport, dialogImport('confirmDialog')),
    { name: 'remove Escape handler', find: ESC, replace: () => '\n' },
    {
      name: 'modal opening',
      find: /<div className="backdrop" onClick=\{onClose\}>\s*<form[\s\S]*?onSubmit=\{submit\}\s*>\s*<div className="modal-head">[\s\S]*?<\/div>\s*/,
      replace: () => '<Modal title="New password" onClose={onClose}>\n      <form onSubmit={submit}>\n        ',
    },
    {
      name: 'modal closing',
      find: /('Save password'\}\s*<\/button>\s*<\/form>)\s*<\/div>/,
      replace: (m, keep) => `${keep}\n    </Modal>`,
    },
    {
      name: 'confirm role change',
      find: /function changeRole\(u, role\) \{\s*if \(role === u\.role\) return\s*if \(!window\.confirm\(`Change \$\{u\.username\} to \$\{ROLE_LABEL\[role\]\}\?`\)\) return/,
      replace: () =>
        "async function changeRole(u, role) {\n    if (role === u.role) return\n    const ok = await confirmDialog({\n      title: `Change ${u.username} to ${ROLE_LABEL[role]}?`,\n      confirmLabel: 'Change role',\n    })\n    if (!ok) return",
    },
    {
      name: 'confirm deactivate',
      find: /function changeStatus\(u\) \{\s*const deactivate = u\.status === 'active'\s*if \(\s*deactivate &&\s*!window\.confirm\(`Deactivate \$\{u\.username\}\? They are logged out and cannot log in again\.`\)\s*\) \{\s*return\s*\}/,
      replace: () =>
        "async function changeStatus(u) {\n    const deactivate = u.status === 'active'\n    if (\n      deactivate &&\n      !(await confirmDialog({\n        title: `Deactivate ${u.username}?`,\n        message: 'They are logged out and cannot log in again.',\n        confirmLabel: 'Deactivate',\n      }))\n    ) {\n      return\n    }",
    },
  ],
  'src/pages/staff/Reservations.jsx': [
    imports(dialogImport('promptDialog')),
    {
      name: 'decline reason',
      find: /function decline\(r\) \{\s*const reason = window\.prompt\(\s*`Decline \$\{r\.reservation_code\}\? Reason shown to the customer \(optional\):`,\s*''\s*\)/,
      replace: () =>
        "async function decline(r) {\n    const reason = await promptDialog({\n      title: `Decline ${r.reservation_code}`,\n      label: 'Reason shown to the customer (optional)',\n      confirmLabel: 'Decline',\n    })",
    },
    {
      name: 'cancel reason',
      find: /function cancel\(r\) \{\s*const reason = window\.prompt\(`Cancel \$\{r\.reservation_code\}\? Reason \(optional\):`, ''\)/,
      replace: () =>
        "async function cancel(r) {\n    const reason = await promptDialog({\n      title: `Cancel ${r.reservation_code}`,\n      label: 'Reason (optional)',\n      confirmLabel: 'Cancel reservation',\n      cancelLabel: 'Keep it',\n    })",
    },
  ],
  'src/pages/staff/MenuManagement.jsx': [
    imports(dialogImport('confirmDialog')),
    {
      name: 'confirm delete dish',
      find: /!window\.confirm\(\s*`Delete \$\{item\.item_name\}\? It leaves the menu for good\. Past requests keep its name\.`\s*\)/,
      replace: () =>
        "!(await confirmDialog({\n        title: `Delete ${item.item_name}?`,\n        message: 'It leaves the menu for good. Past requests keep its name.',\n        confirmLabel: 'Delete dish',\n      }))",
    },
  ],
  'src/pages/customer/Reserve.jsx': [
    imports(dialogImport('confirmDialog')),
    {
      name: 'confirm cancel',
      find: /if \(!window\.confirm\('Cancel this reservation\?'\)\) return/,
      replace: () =>
        "const ok = await confirmDialog({\n      title: 'Cancel this reservation?',\n      confirmLabel: 'Cancel reservation',\n      cancelLabel: 'Keep it',\n    })\n    if (!ok) return",
    },
  ],
}

let failed = 0
for (const [file, edits] of Object.entries(plan)) {
  if (!fs.existsSync(file)) { console.log(`✘ ${file}: file not found (run this from the project root)`); failed++; continue }
  const raw = fs.readFileSync(file, 'utf8')
  const crlf = raw.includes('\r\n')
  let text = raw.replace(/\r\n/g, '\n')
  if (/components\/(Modal\.jsx|dialogs\.js|DialogHost\.jsx)/.test(text)) { console.log(`• ${file}: already done`); continue }
  const bad = edits.filter((e) => !e.find.test(text)).map((e) => e.name)
  if (bad.length) { console.log(`✘ ${file}: left unchanged, no match for: ${bad.join(', ')}`); failed++; continue }
  for (const e of edits) text = text.replace(e.find, e.replace)
  fs.writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text)
  console.log(`✔ ${file}: ${edits.length} edits`)
}
console.log(failed ? `\n${failed} file(s) not changed. Send me this output.` : '\nDone. Now run: npm run dev')