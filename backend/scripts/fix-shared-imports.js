/**
 * Runs after `tsc` in `npm run build`, and so inside the Docker build.
 *
 * tsc resolves `@shared/*` through `paths` while type-checking, but writes the
 * specifier into its output unchanged - and at runtime there is no package
 * called `@shared`. Plain `node dist/backend/src/index.js` then dies on the
 * first shared import with ERR_MODULE_NOT_FOUND. This rewrites each one into a
 * relative path to the copy tsc compiled beside it, in dist/shared/src.
 *
 * `tsx` (dev, tests, the CLI scripts) reads `paths` itself and never needs it.
 *
 * A specifier with no compiled file behind it fails the build here, rather
 * than the container on its first request.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../dist', import.meta.url))
const shared = path.join(dist, 'shared', 'src')
// `from '…'`, `import '…'` and `import('…')`.
const SPEC = /(from\s*|import\s*\(\s*|import\s+)(['"])@shared\/([^'"]+)\2/g

let changed = 0
for (const entry of readdirSync(dist, { recursive: true })) {
  if (!entry.endsWith('.js')) continue
  const file = path.join(dist, entry)
  const source = readFileSync(file, 'utf8')
  const out = source.replace(SPEC, (_, lead, quote, sub) => {
    const target = path.join(shared, sub)
    if (!existsSync(target)) {
      throw new Error(`${entry}: @shared/${sub} has no compiled file at ${target}`)
    }
    let rel = path.relative(path.dirname(file), target).split(path.sep).join('/')
    if (!rel.startsWith('.')) rel = `./${rel}`
    return `${lead}${quote}${rel}${quote}`
  })
  if (out !== source) {
    writeFileSync(file, out)
    changed++
  }
}

console.log(`[build] @shared imports rewritten in ${changed} file(s)`)
