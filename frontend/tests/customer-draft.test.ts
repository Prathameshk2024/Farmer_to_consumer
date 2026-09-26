import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clearName, customerDraftKey, readName, writeName } from '../src/screens/auth/customerDraft.js'
import { draftKey } from '../src/screens/auth/sellerDraft.js'

/**
 * The customer registration screen asks one question - her name - and keeps
 * the answer on the device for the same reason the seller wizard keeps six
 * screens of them: pressing back must not cost her the typing.
 *
 * The rule that matters is the key. On a shared handset one woman registers
 * after another, and a name is the last value that should be waiting in the
 * box for a stranger.
 */
function fakeStore() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    keys: () => [...m.keys()],
  }
}

test('one shopper name is invisible to the next on the same phone', () => {
  const store = fakeStore()
  writeName(store, '9822011223', 'सुनीता पाटील')

  assert.equal(readName(store, '9764455661'), '')
  assert.equal(readName(store, '9822011223'), 'सुनीता पाटील')
})

test('the key is the phone, however it was spelled', () => {
  assert.equal(customerDraftKey('+91 98220 11223'), customerDraftKey('9822011223'))
})

test('a seller draft and a customer draft never share a drawer', () => {
  // The same woman may do both on the same handset, and the seller draft is an
  // object while this one is a bare string - crossing them would throw.
  assert.notEqual(customerDraftKey('9822011223'), draftKey('9822011223'))
})

test('no phone means no draft, rather than a shared one', () => {
  const store = fakeStore()
  writeName(store, '', 'सुनीता')

  assert.deepEqual(store.keys(), [], 'nothing should be written without an identity')
  assert.equal(readName(store, ''), '')
})

test('registering clears it', () => {
  // Otherwise the name sits in the tab after it has been saved to her record,
  // and coming back to change it would restore the old one over the new.
  const store = fakeStore()
  writeName(store, '9822011223', 'सुनीता पाटील')
  clearName(store, '9822011223')

  assert.equal(readName(store, '9822011223'), '')
})
