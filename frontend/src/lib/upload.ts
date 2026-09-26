import { getToken } from './api.js'
import { takeRegisterTicket } from './registerTicket.js'
import {
  COMPRESSION, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, fitWithin, qualitySteps, type UploadKind,
} from './compress.js'

/**
 * Every image this app uploads - product photos, her bank's QR, the payment
 * screenshot she sends the admin - goes through `uploadImage` below, so every
 * one of them is compressed on the phone before a byte is sent.
 *
 * The file goes straight from the phone to Cloudinary using a signature our
 * server issues, so a 4MB photo never passes through the API.
 *
 * Before it leaves the device it is downscaled and re-encoded. A modern phone
 * camera produces 3-6MB per shot; on a village 4G connection that is close to
 * a minute of uploading, and it is the single most likely place a seller gives
 * up halfway through adding her first product.
 */

// The numbers live in compress.ts so tests can reach them without a browser;
// screens keep importing them from here, as before.
export { COMPRESSION, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, type UploadKind }

const BASE = import.meta.env.VITE_API_URL ?? ''

/** Thrown before anything is read, so the message can name the real limit. */
export class FileTooLargeError extends Error {
  constructor(public bytes: number) {
    super(`file is ${(bytes / 1024 / 1024).toFixed(1)}MB, over the ${MAX_UPLOAD_MB}MB limit`)
  }
}

export class NotAnImageError extends Error {}

export interface UploadedImage {
  url: string
  publicId: string
  width: number
  height: number
  bytes: number
}

export class UploadDisabledError extends Error {}

/**
 * Downscale and re-encode as JPEG in a canvas. Returns the original if the
 * phone cannot decode it, or if compressing somehow made it bigger.
 *
 * Every image is re-encoded, including small ones. The old shortcut skipped
 * anything under 600KB, and a phone screenshot is a PNG that is often exactly
 * that - sent as it was, lossless and several times the size it needed to be.
 */
export async function shrinkImage(file: File, kind: UploadKind = 'product'): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  const { maxEdge, quality, targetBytes } = COMPRESSION[kind]

  try {
    // `from-image` applies the camera's EXIF rotation, so a portrait photo is
    // not uploaded lying on its side.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close?.()
      return file
    }
    // JPEG has no transparency, and a transparent PNG pixel encodes as BLACK.
    // White first, so a screenshot or a QR with a clear background stays
    // readable rather than turning into dark text on a black page.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    let best: Blob | null = null
    for (const q of qualitySteps(quality)) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', q))
      if (!blob) break
      best = blob
      if (blob.size <= targetBytes) break
    }
    return best && best.size < file.size ? best : file
  } catch {
    return file
  }
}

interface Signature {
  cloudName: string
  apiKey: string
  signature: string
  timestamp: number
  folder: string
  transformation: string
  uploadUrl: string
}

async function getSignature(kind: UploadKind): Promise<Signature> {
  const token = getToken()

  /**
   * During REGISTRATION there is no session yet - the seller record is created
   * at the very end - so her registration ticket is the proof she offers
   * instead. The server accepts either. Without this the payment-QR upload on
   * the last wizard screen answered 401, which the app could only report as
   * "the photo could not be sent".
   */
  const ticket = token ? '' : takeRegisterTicket()

  const res = await fetch(`${BASE}/api/uploads/signature`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ kind, ticket }),
  })
  if (res.status === 503) {
    throw new UploadDisabledError('Cloudinary is not configured')
  }
  if (!res.ok) throw new Error(`signature ${res.status}`)
  return (await res.json()) as Signature
}

/**
 * Upload one image. `onProgress` receives 0..1 so the UI can show a bar -
 * essential when this can take fifteen seconds on a weak connection.
 */
export async function uploadImage(
  file: File,
  opts: { kind?: UploadKind; onProgress?: (fraction: number) => void } = {},
): Promise<UploadedImage> {
  const { kind = 'product', onProgress } = opts

  // Checked before a byte is read, so a wrong file fails instantly with a
  // message that names the limit rather than after a long silent stall.
  if (!file.type.startsWith('image/')) throw new NotAnImageError(file.type)
  if (file.size > MAX_UPLOAD_BYTES) throw new FileTooLargeError(file.size)

  const blob = await shrinkImage(file, kind)
  const sig = await getSignature(kind)

  const form = new FormData()
  form.append('file', blob)
  form.append('api_key', sig.apiKey)
  form.append('timestamp', String(sig.timestamp))
  form.append('signature', sig.signature)
  form.append('folder', sig.folder)
  form.append('transformation', sig.transformation)

  // XHR rather than fetch: fetch still cannot report upload progress.
  return new Promise<UploadedImage>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', sig.uploadUrl)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`upload ${xhr.status}`))
        return
      }
      const body = JSON.parse(xhr.responseText) as {
        secure_url: string; public_id: string; width: number; height: number; bytes: number
      }
      resolve({
        url: body.secure_url,
        publicId: body.public_id,
        width: body.width,
        height: body.height,
        bytes: body.bytes,
      })
    }
    xhr.onerror = () => reject(new Error('network'))
    xhr.send(form)
  })
}

/**
 * Ask Cloudinary for exactly the size we render, in whatever format the
 * browser prefers. Serving a 1200px master into a 150px card wastes most of
 * the bytes; `f_auto,q_auto` typically halves them again with WebP/AVIF.
 */
export function cloudinaryThumb(url: string, width: number): string {
  if (!url.includes('/image/upload/')) return url
  return url.replace(
    '/image/upload/',
    `/image/upload/f_auto,q_auto,c_fill,w_${width},h_${width}/`,
  )
}
