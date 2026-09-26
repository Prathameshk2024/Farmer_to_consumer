import { Router } from 'express'
import QRCode from 'qrcode'
import { upiProblem } from '@shared/payment.js'
import { callerIp } from '../middleware/auth.js'
import { hashIp } from '../auth/crypto.js'
import { hit, LIMITS } from '../auth/rateLimit.js'

/**
 * THE PAYMENT QR, AS A FILE THE APK CAN SAVE.
 *
 * "Save QR to phone" makes the picture in the browser and downloads it. The
 * APK's WebView silently drops that download and has no share sheet, so inside
 * the app nothing was ever saved. What the wrapper DOES do is hand any URL
 * containing `download=` to Android's own downloader - so this route draws the
 * same QR on the server and serves it as an attachment, and the phone saves it
 * to Downloads, where PhonePe's and Google Pay's gallery pickers can find it.
 *
 * It only ever draws a UPI payment link with a well-formed payee, so it is not
 * a free QR generator for anything anybody types, and it is rate-limited.
 */

export const qrRouter: Router = Router()

/** Long enough for pa, pn, am, cu and a note; a real link is ~150 characters. */
const MAX_LINK = 600

/** Same maroon-on-white as the on-screen code (frontend QrCode.tsx). */
const COLOURS = { dark: '#7b1e2eff', light: '#ffffffff' }

export function qrLinkProblem(link: unknown): string | null {
  if (typeof link !== 'string' || !link) return 'link required'
  if (link.length > MAX_LINK) return 'link too long'
  if (!link.startsWith('upi://pay?')) return 'only UPI payment links'
  const payee = new URLSearchParams(link.slice('upi://pay?'.length)).get('pa') ?? ''
  if (upiProblem(payee)) return 'payee is not a UPI ID'
  return null
}

/** A filename that is safe in a header and on a phone's filesystem. */
export function downloadName(name: unknown): string {
  const base = String(name ?? '')
    .replace(/\.png$/i, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${base || 'shantai-qr'}.png`
}

qrRouter.get('/upi.png', async (req, res) => {
  const limit = hit(`qr:ip:${hashIp(callerIp(req))}`, LIMITS.qrPerIp)
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfterSec))
    res.status(429).json({ error: 'Too many requests', messageMr: 'थोड्या वेळाने पुन्हा प्रयत्न करा.' })
    return
  }

  const link = req.query.link
  const problem = qrLinkProblem(link)
  if (problem) {
    res.status(400).json({ error: problem, messageMr: 'हा QR तयार करता आला नाही' })
    return
  }

  const png = await QRCode.toBuffer(link as string, {
    type: 'png',
    width: 720,
    // A wide quiet zone is what lets a gallery scanner find the corners.
    margin: 4,
    errorCorrectionLevel: 'M',
    color: COLOURS,
  })

  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName(req.query.name)}"`)
  // The link fully determines the image, so a repeat tap need not redraw it.
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.send(png)
})
