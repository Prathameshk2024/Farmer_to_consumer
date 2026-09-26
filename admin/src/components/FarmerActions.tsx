import { useState } from 'react'
import type { FarmerStatus } from '@shared/types.js'
import { useT } from '../i18n/I18nProvider.js'
import { api, type FarmerRow } from '../lib/api.js'
import { Confirm, useConfirm } from './Confirm.js'
import { Button, Pill, useErrorText } from './ui.js'

/**
 * Blocking and unblocking a farmer's account, in one place.
 *
 * They are offered from two screens - her row in the register and her own
 * page - and the dialogs are the whole safeguard: each states what changes
 * for her tomorrow and waits for a second click. Two copies of that would
 * drift, and the copy that drifts is the one that stops saying "her products
 * will disappear from the app".
 */
type Action = 'block' | null

export function FarmerActions({
  farmer, onDone,
}: {
  farmer: FarmerRow
  onDone: () => void
}) {
  const t = useT()
  const errorText = useErrorText()
  const c = useConfirm()

  const [action, setAction] = useState<Action>(null)
  const [blockReason, setBlockReason] = useState('')

  const blocked = farmer.status === 'BLOCKED'

  function ask(next: Exclude<Action, null>) {
    setAction(next)
    setBlockReason('')
    c.ask()
  }

  function close() {
    setAction(null)
    c.close()
  }

  async function run(fn: () => Promise<unknown>) {
    c.setBusy(true)
    c.setError('')
    try {
      await fn()
      close()
      onDone()
    } catch (e) {
      // Stays open on failure, so the server's message is read where it applies.
      c.setError(errorText(e))
    } finally {
      c.setBusy(false)
    }
  }

  return (
    <>
      <div className="row wrap">
        <Button
          variant={blocked ? 'ok' : 'danger'}
          small
          disabled={c.open}
          onClick={() => ask('block')}
        >
          {blocked ? t('se.unblock') : t('se.block')}
        </Button>
      </div>

      {/* ---- block / unblock ---- */}
      <Confirm
        open={c.open && action === 'block'}
        title={blocked ? t('se.unblockTitle') : t('se.blockTitle')}
        description={blocked ? t('se.unblockDesc') : t('se.blockDesc')}
        confirmLabel={blocked ? t('se.unblockConfirmBtn') : t('se.blockConfirmBtn')}
        tone={blocked ? 'primary' : 'danger'}
        busy={c.busy}
        error={c.error}
        onCancel={close}
        onConfirm={() => void run(() => api.blockFarmer(farmer.id, !blocked, blockReason.trim()))}
      >
        {!blocked && (
          <div style={{ marginTop: 10 }}>
            <label className="field__l">{t('se.blockReason')}</label>
            <textarea
              className="textarea"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
            />
          </div>
        )}
      </Confirm>
    </>
  )
}

export function StatusPill({ status }: { status: FarmerStatus }) {
  const t = useT()
  const tone =
    status === 'ACTIVE' ? 'ok'
      : status === 'PENDING_VERIFICATION' ? 'warn'
        : status === 'BLOCKED' ? 'danger'
          : 'neutral'
  return <Pill tone={tone}>{t(`st.${status}`)}</Pill>
}
