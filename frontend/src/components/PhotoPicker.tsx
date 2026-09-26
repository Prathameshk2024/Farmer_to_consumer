import { useRef, useState } from 'react'
import { useT } from '../i18n/I18nProvider.js'
import {
  FileTooLargeError, MAX_UPLOAD_MB, NotAnImageError, UploadDisabledError, uploadImage,
} from '../lib/upload.js'
import { Button, Notice } from './ui.js'
import { IconClose, IconGallery } from './icons.js'

/**
 * Choose one product photo from the gallery, then upload it to Cloudinary.
 *
 * One photo, one button. Once a photo is in, "choose from gallery" goes dead
 * rather than silently replacing what she already picked - a second tap at
 * that point is nearly always a mis-tap. Removing the photo brings it back.
 *
 * If Cloudinary is not configured the component says so and tells the wizard,
 * which then stops asking for a photo it cannot accept.
 */
export default function PhotoPicker({
  imageUrl,
  onUploaded,
  onCleared,
  onUnavailable,
  locked,
  kind = 'product',
  label,
}: {
  imageUrl?: string
  onUploaded: (img: { url: string; publicId: string }) => void
  onCleared: () => void
  onUnavailable?: () => void
  /** Which signed folder it lands in. A payment screenshot is not a listing. */
  kind?: 'product' | 'payment'
  /** What the button offers, when "choose a photo" is not specific enough. */
  label?: string
  /**
   * The photo is settled - she has spent her edits on this listing. The
   * picture still shows; the ways of changing it do not, because a button
   * that only ever answers "no" is worse than no button.
   */
  locked?: boolean
}) {
  const t = useT()
  const galleryRef = useRef<HTMLInputElement | null>(null)

  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [disabled, setDisabled] = useState(false)

  async function handle(file: File | undefined) {
    if (!file) return
    setError(null)
    setProgress(0)
    try {
      const img = await uploadImage(file, {
        kind,
        onProgress: (f) => setProgress(f),
      })
      onUploaded({ url: img.url, publicId: img.publicId })
    } catch (err) {
      if (err instanceof UploadDisabledError) {
        setDisabled(true)
        onUnavailable?.()
      } else if (err instanceof FileTooLargeError) {
        // Name the limit AND what she picked. "Too big" on its own leaves her
        // guessing which photo to try next.
        setError(t('photo.tooBig', {
          max: MAX_UPLOAD_MB,
          size: (err.bytes / 1024 / 1024).toFixed(1),
        }))
      } else if (err instanceof NotAnImageError) {
        setError(t('photo.notImage'))
      } else {
        setError(t('photo.failed'))
      }
    } finally {
      setProgress(null)
    }
  }

  if (disabled) {
    return <Notice tone="warn">{t('photo.disabled')}</Notice>
  }

  return (
    <div className="stack-sm">
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void handle(e.target.files?.[0])
          // Clearing the input is what lets her remove a photo and then pick
          // the very same file again - onChange never fires twice for one value.
          e.target.value = ''
        }}
      />

      {imageUrl && (
        <div style={{ position: 'relative' }}>
          <img
            src={imageUrl}
            alt=""
            style={{
              width: '100%', aspectRatio: '1', objectFit: 'cover',
              borderRadius: 'var(--r-lg)', border: '1px solid var(--line)',
            }}
          />
          <Button
            variant="quiet"
            size="sm"
            onClick={onCleared}
            hidden={locked}
            style={{ position: 'absolute', top: 8, right: 8, width: 'auto' }}
          >
            <IconClose aria-hidden="true" />
          </Button>
        </div>
      )}

      {progress !== null && (
        <div>
          <div className="small dim">{t('photo.uploading')} {Math.round(progress * 100)}%</div>
          <div
            style={{
              height: 8, borderRadius: 4, background: 'var(--surface-2)',
              border: '1px solid var(--line)', overflow: 'hidden', marginTop: 4,
            }}
          >
            <div
              style={{
                width: `${Math.round(progress * 100)}%`, height: '100%',
                background: 'var(--maroon)', transition: 'width .2s',
              }}
            />
          </div>
        </div>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      {!locked && (
        <Button
          variant="ghost"
          onClick={() => galleryRef.current?.click()}
          disabled={progress !== null || !!imageUrl}
        >
          <IconGallery aria-hidden="true" /> {label ?? t('photo.choose')}
        </Button>
      )}

      {/* Said up front. A limit she only meets by breaking it is a limit that
          costs her an upload and a retry on a slow connection. */}
      {!imageUrl && (
        <div className="tiny dim center">{t('photo.limit', { max: MAX_UPLOAD_MB })}</div>
      )}
    </div>
  )
}
