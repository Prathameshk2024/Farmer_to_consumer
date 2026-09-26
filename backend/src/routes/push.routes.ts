import { Router } from 'express'
import { hashIp } from '../auth/crypto.js'
import { hit, LIMITS } from '../auth/rateLimit.js'
import { getDb, save } from '../db/store.js'
import { callerIp, requireRole } from '../middleware/auth.js'
import { registerPushToken } from '../push/register.js'

export const pushRouter = Router()

/**
 * The APK hands the page its phone's notification token; the page sends it
 * here. It is kept on THIS session (see push/register.ts), so logging out stops
 * the notifications and a second person signing in on the phone takes it over.
 */
pushRouter.post('/token', requireRole('seller', 'customer'), (req, res) => {
  const auth = req.auth!
  const perSession = hit(`push:session:${auth.sessionId}`, LIMITS.pushTokenPerSession)
  const perIp = hit(`push:ip:${hashIp(callerIp(req))}`, LIMITS.pushTokenPerIp)
  if (!perSession.ok || !perIp.ok) {
    res.setHeader('Retry-After', String(Math.max(perSession.retryAfterSec, perIp.retryAfterSec)))
    res.status(429).json({ error: 'Too many requests', messageMr: 'थोड्या वेळाने पुन्हा प्रयत्न करा.' })
    return
  }

  const result = registerPushToken(getDb(), auth.sessionId, req.body)
  if (!result.ok) {
    res.status(result.status).json({ error: result.error, messageMr: result.messageMr })
    return
  }
  if (result.changed) save()
  res.json({ ok: true })
})
