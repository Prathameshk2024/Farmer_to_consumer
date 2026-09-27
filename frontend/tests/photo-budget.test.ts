import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * The landing page is opened on cheap phones over rural 4G. The hero has
 * to arrive before the reader gives up, so its weight is a rule, not a hope.
 */
const dir = fileURLToPath(new URL('../src/assets/photos/', import.meta.url))
const kb = (f: string) => statSync(dir + f).size / 1024

test('the hero photo stays under 180 KB', () => {
  assert.ok(kb('hero-field.jpg') <= 180, `hero-field.jpg is ${kb('hero-field.jpg').toFixed(0)} KB`)
  assert.ok(kb('hero-field-tall.jpg') <= 180, `hero-field-tall.jpg is ${kb('hero-field-tall.jpg').toFixed(0)} KB`)
})

test('the landing photos together stay under 450 KB', () => {
  const landing = ['hero-field.jpg', 'step-register.jpg', 'step-list.jpg', 'step-sell.jpg']
  const total = landing.reduce((n, f) => n + kb(f), 0)
  assert.ok(total <= 450, `landing photos weigh ${total.toFixed(0)} KB`)
})
