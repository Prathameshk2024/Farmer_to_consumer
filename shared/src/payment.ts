/**
 * WHAT A PAYMENT REFERENCE AND A UPI ID HAVE TO LOOK LIKE
 * ======================================================
 * Both numbers on this page are typed by hand, by someone reading them off a
 * second app, and both are unrecoverable when wrong in opposite directions:
 *
 *   a wrong UPI ID   - the money leaves and arrives somewhere else
 *   a wrong UTR      - the money arrived, but nothing here can prove it
 *
 * There is no gateway in this app and no callback from a bank. A seller looks
 * at her UPI app and decides whether a payment happened, so a reference number
 * that cannot match a line in her statement is not a weak record - it is no
 * record, and it is the buyer who is left holding an unconfirmed order.
 *
 * `length < 6` was the rule on both, on both sides, which accepted "123456"
 * and "asdfgh" and every mistyped screenshot number in between.
 *
 * WHAT THIS FILE WILL NOT DO
 * --------------------------
 * It cannot tell you a payment is real. A well-formed UTR is still a claim,
 * and `awaitingPaymentConfirmation()` in orderFlow.ts is what makes the seller
 * look before an order moves. This narrows what can be typed; it does not
 * verify anything, and no caller should read it as if it did.
 */

/**
 * A UPI reference number is the 12-digit RRN, and every app shows it.
 *
 * GPay calls it "UPI transaction ID", Paytm "UPI Ref No.", PhonePe puts it
 * under "UTR" - all of them the same twelve digits, because that is what the
 * banks settle on. PhonePe ALSO shows a longer alphanumeric of its own, which
 * is the one number here that is useless to a seller: it appears nowhere in
 * her bank statement.
 */
export const UTR_LENGTH = 12

/**
 * Spaces and hyphens only.
 *
 * Apps print the number in groups, and she copies it as she sees it. Stripping
 * every non-digit instead would quietly turn PhonePe's "T2409141633..." into
 * twelve digits that were never an RRN - wrong input has to stay wrong so it
 * can be reported.
 */
export function normalizeUtr(value: string | undefined): string {
  return String(value ?? '').replace(/[\s-]/g, '')
}

export function isValidUtr(value: string | undefined): boolean {
  return new RegExp(`^\\d{${UTR_LENGTH}}$`).test(normalizeUtr(value))
}

/**
 * Marathi, like `sellerProfileProblems` - it is what both sides already put in
 * `fields`, and a second English table would be one more thing to leave behind.
 */
export function utrProblem(value: string | undefined): string | null {
  const utr = normalizeUtr(value)
  if (!utr) return 'पेमेंट झाल्यावर मिळणारा 12 अंकी क्रमांक टाका'
  if (/\D/.test(utr)) return 'UTR फक्त अंकांचा असतो. तुमच्या UPI ॲपमधला 12 अंकी क्रमांक पहा'
  if (utr.length !== UTR_LENGTH) {
    return `UTR 12 अंकी असतो, तुम्ही ${utr.length} अंक टाकले. UPI ॲपमध्ये तो पुन्हा पहा`
  }
  return null
}

/* ================================================================== */
/* UPI ID                                                              */
/* ================================================================== */

/**
 * The PSP handles that actually exist, as of this writing.
 *
 * This list is here for ONE job: catching a typo in the half of the address
 * that has no spelling. A woman can check "sunita" herself because it is her
 * own name; she cannot check "ybl" against anything, and "ybll" looks exactly
 * as right to her as "ybl".
 *
 * It is deliberately NOT an allow-list. A handle nobody here has heard of is
 * accepted - new banks and new apps appear, this file does not, and refusing
 * a seller's real UPI ID because the list is a year old would cost her every
 * order she takes. Only a handle that is one or two characters away from a
 * real one is refused, because that is a typo rather than a new bank.
 */
export const KNOWN_UPI_HANDLES = [
  // PhonePe, Google Pay, Paytm, Amazon Pay, BHIM, WhatsApp - the apps a rural
  // seller actually has on her phone, so the ones a typo is most likely in.
  'ybl', 'ibl', 'axl',
  'okaxis', 'oksbi', 'okhdfcbank', 'okicici',
  'paytm', 'ptyes', 'ptsbi', 'ptaxis', 'pthdfc', 'ptybl',
  'apl', 'yapl', 'rapl',
  'upi',
  'waaxis', 'wahdfcbank', 'waicici', 'wasbi',
  // Newer apps built on a partner bank.
  'slice', 'naviaxis', 'jupiteraxis', 'fifederal', 'axisb', 'superyes', 'seyes',
  'timecosmos', 'goaxb', 'famapp', 'tapicici', 'omni', 'mairtel',
  // Banks, for a seller who uses her own bank's app rather than a wallet.
  'sbi', 'hdfcbank', 'icici', 'myicici', 'axisbank', 'kotak', 'kmbl', 'pnb',
  'barodampay', 'unionbank', 'uboi', 'ubi', 'cnrb', 'canara', 'idfcbank',
  'idfcfirst', 'indianbank', 'iob', 'uco', 'cbin', 'mahb', 'federal', 'fbl',
  'rbl', 'yesbank', 'yesbankltd', 'indus', 'dbs', 'sib', 'csbpay', 'tjsb',
  'jkb', 'kbl', 'dcb', 'equitas', 'finobank', 'idbi', 'karb', 'ausfb', 'esfb',
  'psb', 'ubin', 'utbi', 'vijb', 'srcb', 'cub', 'hsbc', 'sc',
  // Wallets and older aggregators still in use.
  'abfspay', 'airtel', 'freecharge', 'payzapp', 'pockets', 'ikwik', 'kaypay',
]

const HANDLES = new Set(KNOWN_UPI_HANDLES)

/** UPI addresses are case-insensitive, so every comparison here is lowercase. */
export function normalizeUpi(value: string | undefined): string {
  return String(value ?? '').trim().toLowerCase()
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[b.length]
}

/**
 * The nearest real handle, when the one typed is close enough to be a slip.
 *
 * One character on a short handle, two on a longer one: "ybll" is a typo of
 * "ybl", but "ybl" is not a typo of "upi" and never gets offered as one.
 */
function nearestHandle(handle: string): string | null {
  let best: string | null = null
  let bestDistance = Infinity
  for (const known of HANDLES) {
    const d = editDistance(handle, known)
    if (d < bestDistance) {
      bestDistance = d
      best = known
    }
  }
  const allowed = handle.length <= 4 ? 1 : 2
  return best && bestDistance <= allowed ? best : null
}

const EXAMPLE = 'sunita@ybl'

/**
 * Why a UPI ID cannot be used, or null when it looks like an address.
 *
 * The separator rules matter more than they look. A UPI ID is read aloud over
 * a phone and typed by someone else, and a doubled dot is the commonest thing
 * to survive that - no real VPA has one, so it is safe to refuse and it is a
 * mistake nobody would otherwise catch until the money moved.
 */
export function upiProblem(value: string | undefined): string | null {
  const upi = normalizeUpi(value)
  if (!upi) return 'UPI आयडी टाका. उदा. ' + EXAMPLE

  const at = upi.indexOf('@')
  if (at < 0 || at !== upi.lastIndexOf('@')) {
    return 'UPI आयडीमध्ये एकच @ असतो. उदा. ' + EXAMPLE
  }

  const local = upi.slice(0, at)
  const handle = upi.slice(at + 1)

  if (local.length < 2 || local.length > 64) return 'UPI आयडी बरोबर नाही. उदा. ' + EXAMPLE
  if (!/^[a-z0-9._-]+$/.test(local)) return 'UPI आयडीमध्ये हे अक्षर चालत नाही. उदा. ' + EXAMPLE
  if (!/^[a-z0-9]/.test(local) || !/[a-z0-9]$/.test(local)) {
    return 'UPI आयडी अक्षर किंवा अंकाने सुरू आणि संपतो. उदा. ' + EXAMPLE
  }
  // Two separators in a row - ".." from a doubled tap, "._" from a misread.
  if (/[._-]{2}/.test(local)) return 'UPI आयडीमध्ये दोन टिंब लागोपाठ येत नाहीत. उदा. ' + EXAMPLE

  if (!/^[a-z]{2,32}$/.test(handle)) return '@ नंतर बँकेचे नाव येते. उदा. ' + EXAMPLE

  if (!HANDLES.has(handle)) {
    const near = nearestHandle(handle)
    if (near) return `"@${handle}" तपासा. तुम्हाला "@${near}" म्हणायचे आहे का?`
  }

  return null
}
