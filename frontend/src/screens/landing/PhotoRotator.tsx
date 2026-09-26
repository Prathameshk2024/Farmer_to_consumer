import { useEffect, useState } from 'react'

/**
 * A stack of photographs, cross-fading every two seconds.
 *
 * They carry no alt text on purpose: each set sits beside copy that already
 * says what the pictures show, and four near-identical descriptions read to a
 * screen reader as noise rather than information.
 *
 * A visitor who has asked her system for less motion gets the first frame and
 * no timer - a picture swapping twice a second past her is the exact thing
 * that setting is there to stop.
 */
export default function PhotoRotator({ photos }: { photos: string[] }) {
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (photos.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setShown((n) => (n + 1) % photos.length), 2000)
    return () => clearInterval(id)
  }, [photos.length])

  return (
    <div className="heroshots">
      {photos.map((src, i) => (
        <img key={src} src={src} alt="" aria-hidden="true" className={i === shown ? 'is-on' : undefined} />
      ))}
    </div>
  )
}
