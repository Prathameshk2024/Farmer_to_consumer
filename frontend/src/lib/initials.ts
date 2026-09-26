/**
 * A PERSON'S INITIALS, IN A SCRIPT THAT DOES NOT SLICE
 * ====================================================
 * Kept apart from the component that draws them, because this is the part with
 * a rule in it and the part worth testing.
 *
 * THE DEVANAGARI PROBLEM
 * `name.slice(0, 1)` on सुनीता yields स. That is not how the name starts: the
 * ु is a separate code point belonging to the same syllable, and slicing drops
 * it to print a letter she would not recognise as hers. What is wanted is the
 * first written syllable - the akshara - which is सु.
 *
 * Two things make that more than a character class:
 *
 *  - vowel signs and nasal marks HANG OFF the consonant and belong to it
 *    (कुंभार starts कुं, not क);
 *  - a virama JOINS the consonant to the next one, so the pair is a single
 *    written letter (क्षमा starts क्ष). Stopping at the virama would print
 *    क् - a half-form that does not stand on its own and looks like a typo.
 *
 * Latin names get two initials, because that is the convention there (AK for
 * Arpita Kumbhar). Devanagari gets one akshara: अ क is not how an initial is
 * written in Marathi, and stacking two reads as a misspelt word rather than as
 * a monogram.
 */

/** Combining marks: Latin diacritics, and the Devanagari signs and matras. */
const MARK = /[̀-ͯऀ-ःऺ-ॏ॑-ॗॢॣ]/
/** Halant. Binds this consonant to the following one: क + ् + ष = क्ष. */
const VIRAMA = '्'

/** The first written letter of a word, marks and conjuncts included. */
function firstCluster(word: string): string {
  const chars = Array.from(word)
  if (chars.length === 0) return ''

  let out = chars[0]!
  let i = 1

  while (i < chars.length && MARK.test(chars[i]!)) {
    const mark = chars[i]!
    out += mark
    i++

    // A virama with something after it means the next consonant is part of
    // this same letter, so take it and keep going - a conjunct can chain.
    if (mark === VIRAMA && i < chars.length) {
      out += chars[i]!
      i++
    }
  }

  return out
}

/**
 * Initials for a display name.
 *
 * Empty for an empty name, so a record with no name yet renders an empty
 * circle rather than a stray letter from whatever placeholder was lying about.
 */
export function initialsOf(name: string | undefined): string {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''

  const first = firstCluster(words[0]!)
  const isLatin = /^[A-Za-z]/.test(first)
  if (!isLatin || words.length < 2) return first.toUpperCase()

  return (first + firstCluster(words[words.length - 1]!)).toUpperCase()
}
