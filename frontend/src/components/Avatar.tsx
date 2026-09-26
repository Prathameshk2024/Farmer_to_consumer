import { initialsOf } from '../lib/initials.js'

/**
 * A PERSON, SHOWN AS HER INITIALS
 * ===============================
 * Every seller used to appear as the same 👩. One emoji for every woman on the
 * platform tells you nothing - a list of five sellers looked like one seller
 * repeated - and for a product whose whole point is that these are named,
 * individual businesswomen rather than anonymous supply, that was the wrong
 * picture. Her initial is at least hers.
 *
 * The rule for working out those initials lives in lib/initials.ts, because
 * Devanagari makes it a real rule rather than a `slice`.
 *
 * NO PER-NAME COLOURS. The obvious next step is a background hashed from the
 * name, and this app deliberately does not do that: spec section 6 spends
 * colour on meaning - what to tap, what changed, what went wrong - never on
 * decoration. A screenful of tinted circles would make the one status colour
 * on the page harder to find. The letters are the identity; the circle is a
 * frame.
 */
export function Avatar({
  name,
  size = 62,
  className = 'avatar',
}: {
  name: string | undefined
  size?: number
  /** `avatar` by default; pass `shop-avatar` for the big one on a shop page. */
  className?: string
}) {
  return (
    <div
      className={className}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      // Her name is always written next to this, so announcing the initials
      // would only repeat the same word to a screen reader.
      aria-hidden="true"
      title={name}
    >
      {initialsOf(name)}
    </div>
  )
}
