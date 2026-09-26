import crypto from 'node:crypto'
import { Router } from 'express'
import { cloudinary, usingCloudinary } from '../config.js'
import { requireRole } from '../middleware/auth.js'

/**
 * CLOUDINARY — SIGNED DIRECT UPLOAD
 * =================================
 * The browser uploads straight to Cloudinary; the image bytes never touch this
 * server. That keeps a 3MB photo off our bandwidth and out of our request
 * limits, and it is markedly faster on a rural connection.
 *
 * The API secret stays here. We only hand the client a signature that is valid
 * for one upload, into one folder, at one moment. An *unsigned* preset would
 * be simpler but lets anyone on the internet fill your Cloudinary account.
 *
 * Flow:
 *   client → POST /api/uploads/signature   (authenticated)
 *   client → POST to Cloudinary with file + signature
 *   client → sends the returned secure_url with the product
 */
export const uploadsRouter: Router = Router()

/**
 * Cloudinary signs the sha1 of `key=value` pairs sorted by key, + the secret.
 * Exported for scripts/backup.ts, which uploads into a backup account.
 */
export function sign(params: Record<string, string | number>, secret: string): string {
  const canonical = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return crypto.createHash('sha1').update(canonical + secret).digest('hex')
}

/**
 * A signature needs a signed-in caller. The registration wizard creates the
 * account before it asks for the payment QR, so a new farmer already has a
 * session by the time they upload anything.
 */
uploadsRouter.post('/signature', requireRole('farmer', 'customer', 'admin'), (req, res) => {
  if (!usingCloudinary || !cloudinary) {
    res.status(503).json({
      error: 'Image uploads are not configured',
      messageMr: 'फोटो अपलोड सध्या बंद आहे',
    })
    return
  }

  const kind = req.body?.kind === 'payment' ? 'payment' : 'product'

  // Scope every upload to a folder we control, and tag it with who uploaded it
  // so an orphaned image can be traced back later.
  const folder = `${cloudinary.folder}/${kind}`
  const timestamp = Math.floor(Date.now() / 1000)

  const params: Record<string, string | number> = {
    folder,
    timestamp,
    // Cloudinary applies this on upload, so what is stored is compressed even
    // if a phone could not compress it first (an old browser, an image its
    // canvas could not decode). The phone already sends JPEG at these sizes;
    // this is the backstop. A payment screenshot keeps more pixels and better
    // quality, because the admin has to READ the UTR and time on it - the same
    // split as COMPRESSION in frontend/src/lib/upload.ts.
    transformation: kind === 'payment'
      ? 'c_limit,w_1800,h_1800,q_auto:good'
      : 'c_limit,w_1200,h_1200,q_auto',
  }

  res.json({
    cloudName: cloudinary.cloudName,
    apiKey: cloudinary.apiKey,
    signature: sign(params, cloudinary.apiSecret),
    ...params,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/upload`,
  })
})

/**
 * Delete an image. Used when a farmer replaces a product photo, so the old one
 * does not sit in the account forever.
 */
/**
 * Remove one image from the account.
 *
 * Exported because deleting a product has to do this too, and the moment its
 * record goes so does the only copy of its `imagePublicId` - an image nobody
 * can name again is an image nobody can ever clear.
 *
 * Returns whether Cloudinary took it, and throws for nothing: a failed
 * cleanup must never stop the delete the farmer actually asked for.
 */
export async function destroyImage(publicId: string | undefined): Promise<boolean> {
  if (!usingCloudinary || !cloudinary || !publicId) return false
  // Never let a caller name an arbitrary asset in the account.
  if (!publicId.startsWith(`${cloudinary.folder}/`)) return false

  const timestamp = Math.floor(Date.now() / 1000)
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: cloudinary.apiKey,
    signature: sign({ public_id: publicId, timestamp }, cloudinary.apiSecret),
  })

  try {
    const resp = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/destroy`,
      { method: 'POST', body },
    )
    return resp.ok
  } catch {
    return false
  }
}

uploadsRouter.post('/delete', requireRole('farmer', 'admin'), async (req, res) => {
  if (!usingCloudinary || !cloudinary) {
    res.status(503).json({ error: 'Image uploads are not configured' })
    return
  }
  const publicId = String(req.body?.publicId ?? '')
  if (!publicId.startsWith(`${cloudinary.folder}/`)) {
    res.status(400).json({ error: 'Not an image of this app' })
    return
  }

  res.status(await destroyImage(publicId) ? 200 : 502).json({ ok: true })
})
