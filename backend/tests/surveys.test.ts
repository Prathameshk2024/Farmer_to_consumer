import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyDb } from '../src/db/seed.js'
import {
  linkableFarmers, linkSurveysByPhone, surveyPhotoUrl, surveyText, unlinkedSurveyPoints,
} from '../src/db/surveys.js'

/**
 * A paper questionnaire and a registered farmer can be the same person. They
 * are linked - whichever arrives second - so the research tables count that
 * person once, from their own record.
 */

const farmer = (over: Record<string, unknown> = {}) => ({ id: 'f1', phone: '9822011223', status: 'ACTIVE', ...over }) as never

test('registering links the questionnaires already typed in under that phone, however it was written', () => {
  const db = emptyDb()
  db.surveys.push(
    { id: 'sv1', phone: '+91 98220 11223', fdri: {} } as never,
    { id: 'sv2', phone: '9000000000', fdri: {} } as never,
    { id: 'sv3', fdri: {} } as never,
  )
  assert.equal(linkSurveysByPhone(db, farmer()), 1)
  assert.deepEqual(db.surveys.map((s) => s.linkedFarmerId), ['f1', undefined, undefined])
})

test('a questionnaire already linked to someone is not taken over', () => {
  const db = emptyDb()
  db.surveys.push({ id: 'sv1', phone: '9822011223', linkedFarmerId: 'f0', fdri: {} } as never)
  assert.equal(linkSurveysByPhone(db, farmer()), 0)
  assert.equal(db.surveys[0]!.linkedFarmerId, 'f0')
})

test('a closed account is never offered for linking', () => {
  const db = emptyDb()
  db.farmers.push(farmer(), farmer({ id: 'f2', status: 'CLOSED' }))
  assert.deepEqual(linkableFarmers(db).map((f) => f.id), ['f1'])
})

test('village and taluka are text, trimmed and capped at 80 characters', () => {
  assert.equal(surveyText('  अणदूर  '), 'अणदूर')
  assert.equal(surveyText('x'.repeat(200)).length, 80)
  assert.equal(surveyText({ toString: () => 'अणदूर' }), '', 'an object is not a village')
  assert.equal(surveyText(413601), '')
})

test('a photo is an https address of at most 500 characters, or nothing', () => {
  assert.equal(surveyPhotoUrl('https://res.cloudinary.com/x.jpg'), 'https://res.cloudinary.com/x.jpg')
  assert.equal(surveyPhotoUrl('javascript:alert(1)'), undefined)
  assert.equal(surveyPhotoUrl('http://example.com/x.jpg'), undefined)
  assert.equal(surveyPhotoUrl('https://example.com/' + 'x'.repeat(500)), undefined)
  assert.equal(surveyPhotoUrl(['https://example.com/x.jpg']), undefined)
})

test('the map pins only unlinked questionnaires - a linked one is the farmer, already pinned', () => {
  const db = emptyDb()
  db.surveys.push(
    { id: 'sv1', lat: 18, lng: 76, fdri: {} } as never,
    { id: 'sv2', lat: 18, lng: 76, linkedFarmerId: 'f1', fdri: {} } as never,
    { id: 'sv3', fdri: {} } as never,
  )
  assert.deepEqual(unlinkedSurveyPoints(db).map((s) => s.id), ['sv1'])
})
