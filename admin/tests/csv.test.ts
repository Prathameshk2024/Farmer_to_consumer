import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toCsv } from '@shared/csv.js'

test('BOM first so Excel reads Marathi; quotes and commas survive', () => {
  const s = toCsv(['गाव', 'n'], [['अणदूर, ता. तुळजापूर', 3], ['say "hi"', 1]])
  assert.ok(s.startsWith('﻿'))
  assert.equal(s, '﻿गाव,n\r\n"अणदूर, ता. तुळजापूर",3\r\n"say ""hi""",1\r\n')
})
