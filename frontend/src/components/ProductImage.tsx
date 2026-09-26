import { useState } from 'react'
import { categoryPhoto } from '../lib/categoryPhoto.js'
import { cloudinaryThumb } from '../lib/upload.js'
import { IconProduct } from './icons.js'

/**
 * A product image, straight from Cloudinary's CDN.
 *
 * `src` is the listing's Cloudinary photo when it has one. Without it - an old
 * listing, or Cloudinary off - every list and detail screen gets the category's
 * photograph, or a plain product icon where no honest category photo exists.
 * A photo that fails to load takes that same fallback rather than a broken frame.
 *
 * There is deliberately no cache of our own here. There was one: every card
 * `fetch()`ed its photo into a blob the moment it mounted, which downloaded a
 * whole catalogue's photos while she looked at the first four - `loading="lazy"`
 * could not stop a fetch it never saw - and evicting a blob revoked a URL a
 * card on screen was still using, so Back to a long list swapped real photos
 * for stock ones. The photos never touched our server or database, so it
 * saved no reads either. The browser's own cache already keeps each thumbnail
 * for the 30 days Cloudinary allows, across app restarts, which the blob
 * cache never survived.
 */
export default function ProductImage({
  src,
  categoryId,
  size,
  rounded = 'var(--r-sm)',
  className,
}: {
  src?: string
  /** Ignored. Products no longer show an emoji; kept so old call sites compile. */
  emoji?: string
  /** The seller's category, so a listing with no photo borrows the category's. */
  categoryId?: string
  /** Square side in px. Omit to fill the parent (used by the 1:1 card top). */
  size?: number
  rounded?: string
  className?: string
}) {
  // Ask Cloudinary for the exact rendered size rather than the 1200px master.
  // A 150px card pulling a 1200px file wastes ~95% of the bytes.
  const wanted = src ? cloudinaryThumb(src, (size ?? 400) * 2) : undefined

  // Which URL failed, not whether one did: the same component is handed the
  // next product's photo when the screen changes, and one broken photo must
  // not stick to it.
  const [failedUrl, setFailedUrl] = useState<string>()

  const box: React.CSSProperties = size
    ? { width: size, height: size, borderRadius: rounded }
    : { width: '100%', aspectRatio: '1', borderRadius: rounded }

  if (!wanted || failedUrl === wanted) {
    // A photograph of the seller's category beats a bare icon, and it is a
    // bundled asset, so it needs no request and cannot itself fail to load.
    const stockPhoto = categoryPhoto(categoryId)
    if (stockPhoto) {
      return (
        <img
          className={className}
          src={stockPhoto}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ ...box, objectFit: 'cover' }}
        />
      )
    }

    return (
      <div
        className={className}
        style={{
          ...box,
          background: 'var(--gold-soft)',
          display: 'grid',
          placeItems: 'center',
          fontSize: size ? Math.round(size * 0.42) : '2.4rem',
          color: 'var(--gold-deep)',
          overflow: 'hidden',
        }}
        aria-hidden="true"
      >
        <IconProduct />
      </div>
    )
  }

  return (
    <img
      className={className}
      src={wanted}
      alt=""
      loading="lazy"
      decoding="async"
      style={{ ...box, objectFit: 'cover' }}
      onError={() => setFailedUrl(wanted)}
    />
  )
}
