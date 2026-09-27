import { useState } from 'react'
import type { FarmerStatus } from '@shared/types.js'
import { PLAN } from '@shared/farmer.js'
import { useT } from '../i18n/I18nProvider.js'
import { api, type FarmerRow } from '../lib/api.js'
import { Confirm, PackPicker, useConfirm } from './Confirm.js'
import { Button, Pill, useErrorText } from './ui.js'

/**
 * The three things an admin may do to a farmer's account - grant slots, take
 * them back, block or unblock - in one place. None of them touches
 * verification: a gift of slots is not a check of the person.
 *
 * They are offered from two screens - the farmer's row in the register and their own
 * page - and the dialogs are the whole safeguard: each states what changes
 * for them tomorrow and waits for a second click. Two copies of that would
 * drift, and the copy that drifts is the one that stops saying "your products
 * will disappear from the app".
 */
type Action = 'grant' | 'revoke' | 'block' | null

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
  const [packs, setPacks] = useState(1)
  const [blockReason, setBlockReason] = useState('')

  const blocked = farmer.status === 'BLOCKED'
  const owned = farmer.packsApproved ?? 0
  const used = farmer.slots?.used ?? 0
  const slotsPerPack = PLAN.slotsPerPack

  function ask(next: Exclude<Action, null>) {
    setAction(next)
    setPacks(1)
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
      // Stays open on failure, so the server's message is read where it
      // applies - above all the 409 that refuses a revoke below the slots in use.
      c.setError(errorText(e))
    } finally {
      c.setBusy(false)
    }
  }

  return (
    <>
      <div className="row wrap">
        <Button variant="quiet" small disabled={c.open} onClick={() => ask('grant')}>
          + {t('se.grantSlots')}
        </Button>
        <Button variant="quiet" small disabled={c.open} onClick={() => ask('revoke')}>
          − {t('se.revoke')}
        </Button>
        <Button
          variant={blocked ? 'ok' : 'danger'}
          small
          disabled={c.open}
          onClick={() => ask('block')}
        >
          {blocked ? t('se.unblock') : t('se.block')}
        </Button>
      </div>

      {/* ---- grant ---- */}
      <Confirm
        open={c.open && action === 'grant'}
        title={t('se.grantTitle')}
        description={t('se.grantDesc', { n: packs, slots: packs * slotsPerPack })}
        confirmLabel={t('se.grantConfirm')}
        busy={c.busy}
        error={c.error}
        onCancel={close}
        onConfirm={() => void run(() => api.grantSlots(farmer.id, packs))}
      >
        <PackPicker value={packs} onChange={setPacks} />
      </Confirm>

      {/* ---- revoke ---- */}
      <Confirm
        open={c.open && action === 'revoke'}
        title={owned > 0 ? t('se.revokeTitle') : t('se.revokeNoneTitle')}
        description={
          owned > 0
            ? t('se.revokeDesc', { n: packs, slots: packs * slotsPerPack, used })
            : t('se.revokeNoneDesc')
        }
        confirmLabel={t('se.revokeConfirm')}
        tone="danger"
        busy={c.busy}
        error={c.error}
        onCancel={close}
        // Nothing to take back is refused here: the server would record a
        // revoke of slots that were never there.
        onConfirm={() => (owned > 0 ? void run(() => api.revokeSlots(farmer.id, packs)) : close())}
      >
        {owned > 0 && <PackPicker value={packs} onChange={setPacks} max={owned} />}
      </Confirm>

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
