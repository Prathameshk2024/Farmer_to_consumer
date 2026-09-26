import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildUpiLink, isValidUpi } from '@shared/farmer.js'
import { upiProblem } from '@shared/payment.js'
import { useT } from '../../i18n/I18nProvider.js'
import { api, ApiError } from '../../lib/api.js'
import {
  AppBar, Button, Card, EmptyState, Field, Loading,
  Notice, Pill, TextInput, useAsync,
} from '../../components/ui.js'
import QrCode from '../../components/QrCode.js'
import { IconCheck, IconEdit, IconQr, IconWaiting } from '../../components/icons.js'

/**
 * FARMER PAYMENT QR — a real step, not something we pretend happened.
 *
 * Registration collects her UPI *ID*, because she cannot be paid without one.
 * It does NOT collect a QR image. So this screen is where the payment QR
 * actually gets set up, after admin approval:
 *
 *   Registration → admin approval → SHE ADDS HER PAYMENT QR HERE → customers pay
 *
 * The QR is generated from her own UPI ID rather than uploaded, which is the
 * better default: a generated code carries the exact order amount, while a
 * screenshot of her bank's QR carries none, leaving the customer to type the
 * figure by hand. She can still upload her bank's image if she prefers it.
 *
 * Until she has been through this screen, `upiQrReady` is false and every
 * surface that would show her QR shows an empty state instead. Nothing is
 * invented.
 */
export default function PaymentQr() {
  const t = useT()
  const nav = useNavigate()
  const [me, loading, setMe] = useAsync(() => api.me(), [])

  const [editing, setEditing] = useState(false)
  const [upi, setUpi] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading || !me) {
    return <><AppBar title={t('qrpay.title')} backTo="/farmer/profile" /><div className="screen"><Loading /></div></>
  }

  const farmer = me.farmer
  const hasUpi = isValidUpi(farmer.upiId)
  const ready = !!farmer.upiQrReady && hasUpi

  // A sample amount, purely so she can see what a customer will scan. The real
  // code at checkout is built per order with that order's total.
  const sampleLink = hasUpi
    ? buildUpiLink({
        upiId: farmer.upiId,
        name: farmer.shopName,
        amount: 100,
        note: 'Shantai Mahila Bazar',
      })
    : ''

  async function saveUpi() {
    const fault = upiProblem(upi)
    if (fault) {
      setErr(fault)
      return
    }
    setBusy(true)
    try {
      const res = await api.updateMe({ upiId: upi.trim(), upiQrReady: true })
      setMe({ ...me!, farmer: res.farmer })
      setEditing(false)
      setErr('')
    } catch (e) {
      setErr(e instanceof ApiError ? (e.messageMr ?? e.message) : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    setBusy(true)
    const res = await api.updateMe({ upiQrReady: true })
    setMe({ ...me!, farmer: res.farmer })
    setBusy(false)
  }

  return (
    <>
      <AppBar
        title={t('qrpay.title')}
        backTo="/farmer/profile"
      />

      <div className="screen stack">
        <Notice tone="warn">{t('qrpay.lede')}</Notice>

        {/* ---------- nothing set up yet ---------------------------- */}
        {!ready && !editing && (
          <Card>
            <EmptyState
              icon={IconQr}
              title={t('qrpay.empty')}
              body={hasUpi ? t('qrpay.emptyBodyHasUpi') : t('qrpay.emptyBody')}
              action={
                <Button onClick={() => { setUpi(farmer.upiId ?? ''); setEditing(!hasUpi) ; if (hasUpi) void confirm() }}>
                  {t('qrpay.add')}
                </Button>
              }
            />
          </Card>
        )}

        {/* ---------- editing her UPI ID --------------------------- */}
        {editing && (
          <Card>
            <div className="stack">
              <Field
                label={t('reg.upiLabel')}
                hint={t('reg.upiWhere')}
                error={err}
                required
                htmlFor="upi"
              >
                <TextInput
                  id="upi"
                  value={upi}
                  error={!!err}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => { setUpi(e.target.value.trim()); setErr('') }}
                  placeholder={t('reg.upiPlaceholder')}
                />
              </Field>

              {isValidUpi(upi) && (
                <>
                  <div className="center small dim">{t('qrpay.preview')}</div>
                  <QrCode
                    value={buildUpiLink({ upiId: upi, name: farmer.shopName, amount: 100 })}
                    label={t('qrpay.title')}
                  />
                </>
              )}

              <div className="btn-row">
                <Button variant="quiet" onClick={() => { setEditing(false); setErr('') }}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={() => void saveUpi()} disabled={busy || !isValidUpi(upi)}>
                  {busy ? t('common.loading') : t('common.save')}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* ---------- set up and live ------------------------------ */}
        {ready && !editing && (
          <>
            <Card style={{ textAlign: 'center' }}>
              <div className="stack-sm">
                <strong style={{ fontSize: 'var(--t-md)' }}>{farmer.shopName}</strong>
                <QrCode value={sampleLink} label={t('qrpay.title')} />
                <div className="small dim">{t('qrpay.sample')}</div>

                <div style={{ marginTop: 'var(--s2)' }}>
                  <span className="idpill num">{farmer.upiId}</span>
                </div>

                <div>
                  <Pill tone={farmer.upiVerified ? 'ok' : 'warn'} icon={farmer.upiVerified ? <IconCheck /> : <IconWaiting />}>
                    {farmer.upiVerified ? t('prof.verified') : t('prof.notVerified')}
                  </Pill>
                </div>
              </div>
            </Card>

            <Button variant="ghost" onClick={() => { setUpi(farmer.upiId); setEditing(true) }}>
              <IconEdit aria-hidden="true" /> {t('qrpay.change')}
            </Button>
          </>
        )}

        <Card>
          <div className="small muted">{t('qrpay.how')}</div>
        </Card>

        <Button variant="quiet" onClick={() => nav('/farmer/profile')}>
          {t('common.back')}
        </Button>
      </div>
    </>
  )
}
