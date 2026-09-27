import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import ts from 'typescript'

/**
 * `tsconfig.json` covers `src/**` only, so `npm run typecheck` and the build
 * never read `backend/scripts/`. A script that does not parse therefore passes
 * every gate and fails only when someone runs it - and `admin.ts` is the CLI
 * an admin reaches for when the console is down. A single-quoted string with
 * a literal newline in it once broke every `npm run admin -- …` command that
 * way. Parsing each script here is enough to catch that class of mistake
 * without changing what the build emits.
 */

const dir = new URL('../scripts/', import.meta.url)
const scripts = readdirSync(dir).filter((f) => f.endsWith('.ts'))

test('there are scripts to check, so an empty glob cannot pass silently', () => {
  assert.ok(scripts.includes('admin.ts'))
})

for (const file of scripts) {
  test(`scripts/${file} parses`, () => {
    const out = ts.transpileModule(readFileSync(new URL(file, dir), 'utf8'), {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    })
    const errors = (out.diagnostics ?? []).map((d) => {
      const at = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : '?'
      return `${file}:${at} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`
    })
    assert.deepEqual(errors, [])
  })
}
