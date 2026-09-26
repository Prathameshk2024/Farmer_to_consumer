import { useState } from 'react'
import { useT } from '../i18n/I18nProvider.js'
import { usePincode } from '../store/PincodeContext.js'
import { Button, Field, Notice, TextInput } from './ui.js'
import { IconCheck, IconMap } from './icons.js'

/**
 * The one place a customer enters her pincode.
 *
 * Once set it lives in PincodeContext and is reused by the catalog, the
 * product list and checkout, so she is never asked for it twice. Tapping the
 * chip re-opens it if she has moved.
 */
export default function PincodeBar() {
  const t = useT()
  const { pincode, info, checking, setPincode } = usePincode()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState('')

  async function submit() {
    if (!/^[1-9]\d{5}$/.test(draft)) {
      setErr(t('pin.invalid'))
      return
    }
    const res = await setPincode(draft)
    if (!res) {
      setErr(t('pin.invalid'))
      return
    }
    setErr('')
    setOpen(false)
  }

  /* --- not set yet: ask, plainly ------------------------------- */
  if (!pincode || open) {
    return (
      <div className="card">
        <div className="stack">
          <Field
            label={t('pin.ask')}
            hint={t('pin.askHint')}
            error={err}
            required
            htmlFor="pin-bar"
          >
            <div className="input-voice">
              <TextInput
                id="pin-bar"
                inputMode="numeric"
                maxLength={6}
                value={draft}
                error={!!err}
                placeholder="413601"
                onChange={(e) => { setDraft(e.target.value.replace(/\D/g, '')); setErr('') }}
              />
              <Button
                size="sm"
                onClick={() => void submit()}
                disabled={checking || draft.length !== 6}
                style={{ width: 'auto', flex: '0 0 auto' }}
              >
                {checking ? '…' : t('pin.check')}
              </Button>
            </div>
          </Field>
          {open && pincode && (
            <Button variant="quiet" size="sm" onClick={() => { setOpen(false); setErr('') }}>
              {t('common.cancel')}
            </Button>
          )}
        </div>
      </div>
    )
  }

  /* --- set: show it as a chip, and say what it means ----------- */
  return (
    <div className="stack-sm">
      <button
        className="card card--tap"
        onClick={() => { setDraft(pincode); setOpen(true) }}
        style={{ padding: 'var(--s3) var(--s4)' }}
      >
        <div className="row-between">
          <div className="row" style={{ gap: 'var(--s2)', minWidth: 0 }}>
            <span aria-hidden="true"><IconMap /></span>
            <div style={{ minWidth: 0 }}>
              <div className="tiny dim">{t('pin.deliverTo')}</div>
              <strong className="num">{pincode}</strong>
            </div>
          </div>
          <span className="small" style={{ color: 'var(--maroon)', fontWeight: 700 }}>
            {t('common.edit')}
          </span>
        </div>
      </button>

      {/* Not a refusal any more: nobody has LISTED the seller's area, and an order
          anywhere in Maharashtra still reaches a seller who decides. Saying
          "not available" here contradicted a checkout that goes through. */}
      {info && !info.serviceable && (
        <Notice tone="info" title={t('pin.noService')}>
          {t('pin.noServiceBody')}
          {info.nearbyVillages.length > 0 && (
            <div className="small" style={{ marginTop: 6 }}>
              {t('pin.availableIn')}: {info.nearbyVillages.join(' · ')}
            </div>
          )}
        </Notice>
      )}

      {info && info.serviceable && (
        <div className="tiny dim">
          <IconCheck aria-hidden="true" /> {t('pin.serviceable', { sellers: info.sellerCount, products: info.productCount })}
        </div>
      )}
    </div>
  )
}
