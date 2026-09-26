import { useState } from 'react'
import { useT } from '../i18n/I18nProvider.js'
import { api } from '../lib/api.js'
import { Confirm, useConfirm } from './Confirm.js'
import { Button, CopyValue, Notice, useErrorText } from './ui.js'

/**
 * THE ONE RESET FLOW
 * ==================
 * Used on the farmer page, the buyer panel and the password-request queue.
 *
 * The temporary password is shown once, here, in component state. Closing the
 * panel forgets it and nothing can fetch it again - the server keeps only its
 * hash. The admin reads it out on a call to the account's own number; the
 * person must choose a new one at the next sign-in.
 */
export function ResetPassword({
  role, userId, requestId, onDone,
}: {
  role: 'farmer' | 'customer'
  userId: string
  requestId?: string
  onDone?: () => void
}) {
  const t = useT()
  const errorText = useErrorText()
  const confirm = useConfirm()
  const [temp, setTemp] = useState('')

  async function doReset() {
    confirm.setBusy(true)
    try {
      const r = await api.resetPassword({ role, userId, requestId })
      setTemp(r.tempPassword)
      confirm.close()
    } catch (e) {
      confirm.setError(errorText(e))
    } finally {
      confirm.setBusy(false)
    }
  }

  function forget() {
    setTemp('')
    onDone?.()
  }

  if (temp) {
    return (
      <div className="stack-sm">
        <div className="mono" style={{ fontSize: 32, fontWeight: 800, letterSpacing: '0.2em' }}>{temp}</div>
        <CopyValue value={temp} label={t('pwr.copy')} copiedText={t('pwr.copied')} />
        <Notice tone="warn">{t('pwr.readOut')}</Notice>
        <Button variant="quiet" small onClick={forget}>{t('c.close')}</Button>
      </div>
    )
  }

  return (
    <>
      {!confirm.open && <Button small onClick={confirm.ask}>{t('pwr.reset')}</Button>}
      <Confirm
        open={confirm.open}
        title={t('pwr.reset')}
        description={t('pwr.resetConsequence')}
        confirmLabel={t('pwr.reset')}
        tone="danger"
        busy={confirm.busy}
        error={confirm.error}
        onCancel={confirm.close}
        onConfirm={() => void doReset()}
      />
    </>
  )
}
