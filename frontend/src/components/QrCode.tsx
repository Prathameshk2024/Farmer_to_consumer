import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

/**
 * A real, scannable QR code — generated on the device.
 *
 * Everywhere a QR appears in this app it used to be a 🔳 placeholder, which
 * meant the screen implied data we did not have. This encodes actual values:
 * their shop URL, or a `upi://pay?…` intent built from the UPI ID they gave at
 * registration.
 *
 * Generated locally rather than through an image service, because the app has
 * to work on weak rural 4G, and because a farmer's
 * UPI address should not be sent to a third party to be turned into a picture.
 */
/**
 * Dark leaf green on white (7.9:1): enough contrast for any scanner, and it keeps the code
 * on-brand instead of dropping a black square into a warm page. Shared with
 * the saved copy, so the picture in their gallery is the one they saw on screen.
 */
export const QR_COLOURS = { dark: '#1b5e20ff', light: '#ffffffff' }

export default function QrCode({
  value,
  size = 190,
  label,
}: {
  value: string
  size?: number
  label?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !value) return
    let alive = true

    QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: QR_COLOURS,
    }).catch(() => {
      if (alive) setFailed(true)
    })

    return () => {
      alive = false
    }
  }, [value, size])

  if (!value || failed) {
    return (
      <div
        style={{
          width: size, height: size, margin: '0 auto',
          display: 'grid', placeItems: 'center',
          background: 'var(--surface-2)', border: '1px dashed var(--line-2)',
          borderRadius: 'var(--r)', color: 'var(--ink-3)', fontSize: 'var(--t-sm)',
          textAlign: 'center', padding: 'var(--s3)',
        }}
      >
        {label ?? '—'}
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      aria-label={label ?? value}
      role="img"
      style={{
        width: size, height: size, maxWidth: '100%',
        margin: '0 auto', display: 'block',
        borderRadius: 'var(--r-sm)', background: '#fff',
      }}
    />
  )
}
