import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'src')
const tokenFile = path.join(src, 'styles', 'tokens.css')

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(file) : [file]
  })
}

const files = filesUnder(src).filter((file) => /\.(css|jsx?|mjs)$/.test(file))
const sources = files.map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }))
const tokensText = fs.readFileSync(tokenFile, 'utf8')
const tokens = new Map([...tokensText.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]))

function resolveToken(name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`Token cycle: ${[...seen, name].join(' -> ')}`)
  seen.add(name)
  const value = tokens.get(name)
  if (!value) throw new Error(`Missing token --${name}`)
  const alias = value.match(/^var\(--([\w-]+)\)$/)
  return alias ? resolveToken(alias[1], seen) : value
}

function luminance(hex) {
  const [r, g, b] = hex.slice(1).match(/.{2}/g).map((part) => parseInt(part, 16) / 255)
  const linear = (value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function contrast(a, b) {
  const first = luminance(a)
  const second = luminance(b)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

const pairs = [
  ['text / bg', 'text', 'bg', 4.5],
  ['text / card', 'text', 'card', 4.5],
  ['text-2 / bg', 'text-2', 'bg', 4.5],
  ['text-2 / card', 'text-2', 'card', 4.5],
  ['text-2 / ink-soft', 'text-2', 'ink-soft', 4.5],
  ['text-3 / bg', 'text-3', 'bg', 4.5],
  ['text-3 / card', 'text-3', 'card', 4.5],
  ['text-3 / warn-soft', 'text-3', 'warn-soft', 4.5],
  ['disabled-text / ink-soft', 'disabled-text', 'ink-soft', 4.5],
  ['neutral-text / neutral-soft', 'neutral-text', 'neutral-soft', 4.5],
  ['ok / ok-soft', 'ok', 'ok-soft', 4.5],
  ['warn / warn-soft', 'warn', 'warn-soft', 4.5],
  ['danger / card', 'danger', 'card', 4.5],
  ['danger / brand-soft', 'danger', 'brand-soft', 4.5],
  ['white / charcoal', 'white', 'charcoal', 4.5],
  ['white / brand button', 'white', 'brand', 4.5],
  ['brand focus / white', 'brand', 'white', 3],
  ['control / card', 'control', 'card', 3],
  ['control / bg', 'control', 'bg', 3],
  ['ok-line / charcoal', 'ok-line', 'charcoal', 3],
  ['warn-line / charcoal', 'warn-line', 'charcoal', 3],
]

let failures = 0
console.log('Contrast pairs:')
for (const [label, foreground, background, minimum] of pairs) {
  const ratio = contrast(resolveToken(foreground), resolveToken(background))
  const passed = ratio >= minimum
  console.log(`  ${passed ? 'PASS' : 'FAIL'} ${label}: ${ratio.toFixed(2)}:1 (minimum ${minimum}:1)`)
  if (!passed) failures += 1
}

const rawColors = sources.reduce((count, source) => count + (source.file === tokenFile ? 0 : [...source.text.matchAll(/#[\da-f]{3,8}\b|rgba?\(/gi)].length), 0)
const forbidden = sources.reduce((count, source) => count + [...source.text.matchAll(/(?:linear|radial|conic)-gradient\b|backdrop-filter|animation\s*:[^;{}]*\binfinite\b|transition\s*:\s*all\b/gi)].length, 0)
const wideAccentBorders = sources.reduce((count, source) => count + [...source.text.matchAll(/\bborder(?:-(?:top|bottom|left|right))?\s*:\s*(?:[2-9]|[1-9]\d+)px\s+[^;{}]*(?:var\(--(?:brand|danger|warn|ok)\))/gi)].length, 0)
const disabledRemovedOpacity = sources.reduce((count, source) => count + [...source.text.matchAll(/(?:button:disabled|\.acc-off\b|\.tm-removed\b)[^{]*\{[^}]*\bopacity\s*:/gi)].length, 0)
const duplicateInputStyles = sources.reduce((count, source) => {
  if (source.file === path.join(src, 'styles', 'components.css')) return count
  const rules = [...source.text.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  return count + rules.filter((rule) => /\b(?:input|select|textarea)\b/i.test(rule[1]) && /\b(?:border(?:-radius)?|padding|background)\s*:/i.test(rule[2])).length
}, 0)
const duplicateNoticeStyles = sources.reduce((count, source) => count + [...source.text.matchAll(/\.(?:dash-notice|tm-warn)\s*\{/g)].length, 0)

console.log('\nSelf-audit counts:')
console.log(`  Raw color literals outside tokens.css: ${rawColors}`)
console.log(`  Forbidden visual patterns: ${forbidden}`)
console.log(`  Wide colored accent borders: ${wideAccentBorders}`)
console.log(`  Opacity on disabled or removed states: ${disabledRemovedOpacity}`)
console.log(`  Duplicated input frame styles outside components.css: ${duplicateInputStyles}`)
console.log(`  Duplicated page Notice styles: ${duplicateNoticeStyles}`)

failures += rawColors + forbidden + wideAccentBorders + disabledRemovedOpacity + duplicateInputStyles + duplicateNoticeStyles
if (failures) process.exitCode = 1
