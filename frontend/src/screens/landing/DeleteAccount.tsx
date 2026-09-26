import { Link } from 'react-router-dom'
import { UNDO_DAYS } from '@shared/accountClose.js'
import { useT } from '../../i18n/I18nProvider.js'
import { AppBar, Button, Card, LanguagePicker, Notice, SectionTitle } from '../../components/ui.js'
import { IconCall, IconWhatsapp } from '../../components/icons.js'
import { SUPPORT_PHONE } from '../seller/Misc.js'

/**
 * THE PAGE GOOGLE PLAY ASKS FOR.
 *
 * The policy wants two doors to the same thing: one inside the app, and one a
 * browser can reach without installing it. This is the second, and its URL is
 * what goes in the Play Console data safety form.
 *
 * It is public on purpose - no session, no bottom tabs. Somebody reading it
 * may have deleted the app already, or be reading it on a borrowed computer
 * because the phone with the account on it is gone. That is why the last card
 * is a phone number: every other route through this app needs an OTP sent to
 * a handset she may no longer have.
 */
export default function DeleteAccount() {
  const t = useT()

  return (
    <>
      <AppBar brand title={t('del.title')} />
      <div className="screen stack">
        <Card>
          <LanguagePicker />
        </Card>

        <Card>
          <SectionTitle>{t('del.inAppTitle')}</SectionTitle>
          <ol className="stack-sm" style={{ margin: 0, paddingLeft: 'var(--s5)' }}>
            <li>{t('del.step1')}</li>
            <li>{t('del.step2')}</li>
            <li>{t('del.step3')}</li>
            <li>{t('del.step4')}</li>
          </ol>
          <div style={{ marginTop: 'var(--s4)' }}>
            <Link className="btn btn--ghost" to="/">{t('del.openApp')}</Link>
          </div>
        </Card>

        <Card>
          <SectionTitle>{t('del.whatGoesTitle')}</SectionTitle>
          <p className="body">{t('del.whatGoes')}</p>
          {/* Said here as well as in the privacy policy, because this is the
              page somebody actually reads before deciding. */}
          <Notice tone="warn" title={t('del.whatStaysTitle')}>
            {t('del.whatStays')}
          </Notice>
          <p className="body muted" style={{ marginTop: 'var(--s3)' }}>
            {t('del.sellerWindow', { days: UNDO_DAYS })}
          </p>
        </Card>

        <Card>
          <SectionTitle>{t('del.noAppTitle')}</SectionTitle>
          <p className="body">{t('del.noApp')}</p>
          <div className="btn-row" style={{ marginTop: 'var(--s3)' }}>
            <a className="btn btn--ghost" href={`tel:+91${SUPPORT_PHONE}`}>
              <IconCall aria-hidden="true" /> {t('help.call')}
            </a>
            <a
              className="btn btn--ghost"
              href={`https://wa.me/91${SUPPORT_PHONE}`}
              target="_blank"
              rel="noreferrer"
            >
              <IconWhatsapp aria-hidden="true" /> {t('help.whatsapp')}
            </a>
          </div>
        </Card>

        <Link to="/" style={{ alignSelf: 'center' }}>
          <Button variant="quiet" size="sm">{t('del.back')}</Button>
        </Link>
      </div>
    </>
  )
}
