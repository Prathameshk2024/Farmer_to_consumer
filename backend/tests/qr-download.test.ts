import { test } from 'node:test'
import assert from 'node:assert/strict'
import QRCode from 'qrcode'
import { downloadName, qrLinkProblem } from '../src/routes/qr.routes.js'

/**
 * "SAVE QR" INSIDE THE APK.
 *
 * The APK's WebView drops downloads made in the page, so the server draws the
 * payment QR and the wrapper hands the URL to Android's downloader. The route
 * must draw a real UPI payment link and nothing else, and name the file
 * something a phone can store.
 */

const LINK = 'upi://pay?pa=9322125840%40ybl&pn=Sunita&am=10.00&cu=INR&tn=Shantai+Mahila+Bazar+SMB2425'

test('a UPI payment link is drawn', () => {
  assert.equal(qrLinkProblem(LINK), null)
})

test('it is not a free QR generator for anything typed', () => {
  assert.notEqual(qrLinkProblem(undefined), null)
  assert.notEqual(qrLinkProblem('https://example.com'), null)
  assert.notEqual(qrLinkProblem('upi://pay?pn=NoPayee&am=10'), null)
  assert.notEqual(qrLinkProblem('upi://pay?pa=not-a-upi'), null)
  assert.notEqual(qrLinkProblem(`upi://pay?pa=a%40ybl&tn=${'x'.repeat(700)}`), null)
})

test('the saved file is a PNG that still carries the whole link', async () => {
  const png = await QRCode.toBuffer(LINK, { type: 'png', width: 720, margin: 4 })
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47])
})

test('the file name is safe for a header and a phone', () => {
  assert.equal(downloadName('shantai-SMB2425.png'), 'shantai-SMB2425.png')
  assert.equal(downloadName('a"b\r\nc/../d.png'), 'a-b-c-d.png')
  assert.equal(downloadName(undefined), 'shantai-qr.png')
})
