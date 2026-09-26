import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n/I18nProvider.js'
import { api, type PasswordRequestRow } from '../lib/api.js'
import { waited } from '../lib/format.js'
import { TopBar } from '../components/Shell.js'
import { Confirm, useConfirm } from '../components/Confirm.js'
import { ResetPassword } from '../components/ResetPassword.js'
import { IconBuyer, IconFarmers, IconPasswords } from '../components/icons.js'
import {
  Button, Card, EmptyState, ErrorNote, Field, Loading, Notice, useAsync, useErrorText,
} from '../components/ui.js'

/**
 * FORGOT-PASSWORD REQUESTS
 * ========================
 * Anyone can leave one for any number, so a row is a request to CALL that
 * number, never proof of who asked. Longest wait first. A reset from here
 * closes the row as DONE; "Close" dismisses it with an optional reason.
 */
export function PasswordRequests() {
  const t = useT()
  const [data, loading, error, reload] = useAsync(() => api.passwordRequests('OPEN'), [])
  const rows = data?.requests ?? []

  return (
    <>
      <TopBar title={t('pwr.title')} sub={data ? `${rows.length}` : undefined} />
      <div className="body stack">
        <Notice tone="warn">{t('pwr.callFirst')}</Notice>
        <ErrorNote error={error} />
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Card><EmptyState icon={IconPasswords} title={t('pwr.empty')} /></Card>
        ) : (
          <div className="stack-sm">
            {rows.map((r) => <Row key={r.id} request={r} onDone={reload} />)}
          </div>
        )}
      </div>
    </>
  )
}

function Row({ request: r, onDone }: { request: PasswordRequestRow; onDone: () => void }) {
  const t = useT()
  const errorText = useErrorText()
  const close = useConfirm()
  const [reason, setReason] = useState('')
  const RoleIcon = r.role === 'farmer' ? IconFarmers : IconBuyer
  const wait = waited(r.at)

  async function doClose() {
    close.setBusy(true)
    try {
      await api.closePasswordRequest(r.id, reason.trim() || undefined)
      close.close()
      onDone()
    } catch (e) {
      close.setError(errorText(e))
    } finally {
      close.setBusy(false)
    }
  }

  return (
    <Card>
      <div className="row wrap" style={{ gap: 8, alignItems: 'baseline' }}>
        <span className="strong">{r.name}</span>
        <a className="mono" href={`tel:+91${r.phone}`}>+91 {r.phone}</a>
        <span className="small dim">
          <RoleIcon aria-hidden="true" /> {t(r.role === 'farmer' ? 'pwr.roleFarmer' : 'pwr.roleBuyer')}
          {r.village && <> · {r.village}</>}
        </span>
        <span className="small dim-2 grow" style={{ textAlign: 'right' }}>
          {t(`pwr.wait.${wait.unit}`, { n: wait.n })}
        </span>
      </div>

      <div className="small" style={{ marginTop: 8 }}>
        {!r.matchedUserId ? (
          <span className="dim">{t('pwr.noAccount')}</span>
        ) : r.role === 'farmer' ? (
          <Link to={`/farmers/${r.matchedUserId}`}>{r.matchedName || r.matchedUserId}</Link>
        ) : (
          // Buyers have no detail page in the console; the name is enough to check on the call.
          <span>{r.matchedName || r.matchedUserId}</span>
        )}
      </div>

      <div className="row wrap" style={{ gap: 8, marginTop: 8, alignItems: 'flex-start' }}>
        {r.matchedUserId && (
          <ResetPassword role={r.role} userId={r.matchedUserId} requestId={r.id} onDone={onDone} />
        )}
        {!close.open && <Button variant="quiet" small onClick={close.ask}>{t('pwr.close')}</Button>}
      </div>

      <Confirm
        open={close.open}
        title={t('pwr.close')}
        description={t('pwr.closeConsequence')}
        confirmLabel={t('pwr.close')}
        busy={close.busy}
        error={close.error}
        onCancel={close.close}
        onConfirm={() => void doClose()}
      >
        <Field label={t('pwr.reason')}>
          <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Confirm>
    </Card>
  )
}
