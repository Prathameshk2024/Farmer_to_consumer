import { useT } from '../i18n/I18nProvider.js'

/**
 * PAYING FROM THE SAME PHONE THAT SHOWS THE QR.
 *
 * A phone cannot scan its own screen, and for a while the answer to that was a
 * "Pay" button on a `upi://pay` link that opened PhonePe or Google Pay with
 * everything filled in. It opened them, and then they refused to pay:
 * "declined for security reasons". UPI apps now treat a payment that ANOTHER
 * app starts, to a PERSONAL UPI ID, as the shape of a scam - and every payee
 * in this market, sellers and the college alike, is a personal UPI ID. Nothing
 * in the link can change that; tested on real phones, 14 September 2026.
 *
 * What those same apps do accept is a payment she starts inside them: scanning
 * a QR picked from her gallery, or pasting a UPI ID. So she takes a screenshot
 * of the QR, and the steps say where to take it.
 *
 * There used to be a "Save QR to phone" button here. Inside the APK's WebView
 * it could not save reliably, and a button that does nothing is worse than a
 * screenshot every phone already knows how to take.
 *
 * If payees ever move to business UPI IDs, a pay link works again for those
 * accounts - and only for those.
 */

/**
 * The steps, written out one action each. Scanning from the gallery is a menu
 * she has probably never opened, so each tap gets its own line.
 */
export function PaySteps({ screenshot = false }: { screenshot?: boolean }) {
  const t = useT()
  return (
    <ol className="stack-sm" style={{ margin: 0, paddingLeft: 'var(--s5)' }}>
      <li>{t('pay.step1')}</li>
      <li>{t('pay.step2')}</li>
      <li>{t('pay.step3')}</li>
      <li>{t('pay.step4')}</li>
      <li>{t('pay.step5')}</li>
      {/* Where proof is asked for, the step to capture it comes BEFORE she
          leaves the success screen - it is gone once she presses back. */}
      {screenshot && <li>{t('pay.stepScreenshot')}</li>}
      <li>{t('pay.step6')}</li>
    </ol>
  )
}
