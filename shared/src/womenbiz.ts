/**
 * SHANTAI MAHILA BAZAR ID
 * ===========
 * Format: SMB-<VILLAGE>-<NN>   e.g.  SMB-CHIVARI-03
 *
 * The ID goes on her packaging, her QR poster and her product labels, so it has
 * to be readable aloud over a phone and typed by someone who does not read
 * Devanagari. That means a Latin village code, and a serial that is per-village
 * rather than global - SMB-CHIVARI-03 says she is the THIRD woman from Chivri,
 * which tells a field coordinator where to go; a global SMB-000431 tells them
 * nothing.
 *
 * Two digits. Ninety-nine women from one village is far beyond what this
 * programme plans for, and `padStart` does not truncate - a hundredth would
 * simply be SMB-CHIVARI-100 rather than a collision.
 */

/**
 * The survey villages named in the project plan, with fixed codes.
 *
 * Adding one here is all it takes: the serial is counted per prefix, so a new
 * village starts at 001 without touching anybody else's number.
 */
/**
 * THE TALUKA IS PER VILLAGE, NOT ONE FOR THE LIST.
 *
 * Every row here said तुळजापूर, which was true of the first village and then
 * copied down the list. Four of the six are not in Tuljapur at all, and the
 * taluka is not decoration: it is written onto her seller record, printed
 * with her address, and is how a field coordinator works out whose round she
 * is on. A woman in Umarga filed under Tuljapur is a woman nobody visits.
 *
 * Checked against the 2011 census village lists and the Dharashiv district
 * village directory, September 2026. All six are in धाराशिव (Osmanabad).
 * Correct one of these only against the register, never by inference from a
 * neighbouring village - `wadi` hamlets in particular sit under a different
 * taluka from the village they are named after.
 */
export const VILLAGES: { mr: string; code: string; taluka: string; district: string }[] = [
  { mr: 'आणदुर', code: 'ANADUR', taluka: 'तुळजापूर', district: 'धाराशिव' },
  { mr: 'जेवळी', code: 'JEVALI', taluka: 'लोहारा', district: 'धाराशिव' },
  { mr: 'भोसगा', code: 'BHOSGA', taluka: 'लोहारा', district: 'धाराशिव' },
  { mr: 'चिवरी', code: 'CHIVARI', taluka: 'तुळजापूर', district: 'धाराशिव' },
  { mr: 'रुद्रवाडी', code: 'RUDRAWADI', taluka: 'लोहारा', district: 'धाराशिव' },
  { mr: 'येळी', code: 'YELI', taluka: 'उमरगा', district: 'धाराशिव' },
]

/* Devanagari -> Latin. Deliberately lossy: this produces a readable code, not
   a reversible transliteration. Known villages use the table above instead. */
const CONSONANTS: Record<string, string> = {
  क: 'K', ख: 'KH', ग: 'G', घ: 'GH', ङ: 'N',
  च: 'CH', छ: 'CHH', ज: 'J', झ: 'JH', ञ: 'N',
  ट: 'T', ठ: 'TH', ड: 'D', ढ: 'DH', ण: 'N',
  त: 'T', थ: 'TH', द: 'D', ध: 'DH', न: 'N',
  प: 'P', फ: 'PH', ब: 'B', भ: 'BH', म: 'M',
  य: 'Y', र: 'R', ल: 'L', व: 'V', ळ: 'L',
  श: 'SH', ष: 'SH', स: 'S', ह: 'H', क्ष: 'KSH', ज्ञ: 'DNY',
}

const INDEPENDENT_VOWELS: Record<string, string> = {
  अ: 'A', आ: 'A', इ: 'I', ई: 'I', उ: 'U', ऊ: 'U',
  ए: 'E', ऐ: 'AI', ओ: 'O', औ: 'AU', ऋ: 'RU',
}

const MATRAS: Record<string, string> = {
  'ा': 'A',  // ा
  'ि': 'I',  // ि
  'ी': 'I',  // ी
  'ु': 'U',  // ु
  'ू': 'U',  // ू
  'े': 'E',  // े
  'ै': 'AI', // ै
  'ो': 'O',  // ो
  'ौ': 'AU', // ौ
  'ृ': 'RU', // ृ
}

const HALANT = '्'
const ANUSVARA = 'ं'

/**
 * Turn a Marathi place name into an uppercase Latin code.
 * आणदुर -> ANADUR   जेवळी -> JEVALI   रुद्रवाडी -> RUDRAVADI
 */
export function transliterate(input: string): string {
  const chars = Array.from((input || '').trim())
  let out = ''

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const next = chars[i + 1]

    if (CONSONANTS[ch]) {
      out += CONSONANTS[ch]
      if (next && MATRAS[next]) {
        out += MATRAS[next]
        i++
      } else if (next === HALANT) {
        // Conjunct: no vowel between this consonant and the next.
        i++
      } else {
        out += 'A' // the inherent vowel
      }
      continue
    }

    if (INDEPENDENT_VOWELS[ch]) {
      out += INDEPENDENT_VOWELS[ch]
      continue
    }

    if (ch === ANUSVARA) { out += 'N'; continue }
    if (/[A-Za-z]/.test(ch)) { out += ch.toUpperCase(); continue }
    // spaces, punctuation and anything unmapped are dropped
  }

  // Trailing inherent 'A' reads as noise in a code: ANADURA -> ANADUR
  out = out.replace(/A$/, '')
  return out || 'GAON'
}

/** Village code from the known list, falling back to transliteration. */
export function villageCode(villageMr: string): string {
  const known = VILLAGES.find((v) => v.mr === (villageMr || '').trim())
  if (known) return known.code
  return transliterate(villageMr).slice(0, 12)
}

/**
 * Build the next Shanta Mahila Bazar ID for a village.
 * `existingIds` is every ID already issued; the serial is per-village.
 */
export function makeWomenBizId(villageMr: string, existingIds: string[]): string {
  const code = villageCode(villageMr)
  const prefix = `SMB-${code}-`
  const used = existingIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => parseInt(id.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n))
  const next = (used.length ? Math.max(...used) : 0) + 1
  return `${prefix}${String(next).padStart(2, '0')}`
}

export function parseWomenBizId(id: string): { village: string; serial: number } | null {
  // 2 or more digits: the old three-digit ids stay parseable.
  const m = /^SMB-([A-Z]+)-(\d{2,})$/.exec(id || '')
  if (!m) return null
  return { village: m[1], serial: parseInt(m[2], 10) }
}

/** URL-safe shop slug. Her share QR resolves to /s/<slug>. */
export function makeShopSlug(shopName: string, womenBizId: string): string {
  const latin = transliterate(shopName).toLowerCase().replace(/[^a-z0-9]/g, '')
  const tail = womenBizId.toLowerCase().replace(/[^a-z0-9]/g, '-')
  return latin ? `${latin.slice(0, 20)}-${tail}` : tail
}
