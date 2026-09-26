import { useState, type ReactNode } from 'react'
import { useT } from '../i18n/I18nProvider.js'
import { Button, Notice } from './ui.js'

/**
 * A confirmation step that explains what is about to happen.
 *
 * Every action it guards changes what a real woman can do tomorrow - her slot
 * allowance, whether her shop is visible at all. A native `confirm()` cannot
 * say any of that, and cannot be translated, so this replaces it wherever the
 * consequence needs describing.
 *
 * The description is not decoration. "Grant slots" means nothing on its own;
 * "she will be able to publish 5 more products" is the thing being decided.
 */
export function Confirm({
  open,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  busy,
  error,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  tone?: 'primary' | 'danger'
  busy?: boolean
  error?: string
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}) {
  const t = useT()
  if (!open) return null

  return (
    <div className="confirm">
      <div className="confirm__t">{title}</div>
      <div className="confirm__d">{description}</div>
      {children}
      {error && <div style={{ marginTop: 8 }}><Notice tone="danger">{error}</Notice></div>}
      <div className="row" style={{ marginTop: 10 }}>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} small disabled={busy} onClick={onConfirm}>
          {busy ? t('c.loading') : confirmLabel}
        </Button>
        <Button variant="quiet" small disabled={busy} onClick={onCancel}>
          {t('c.cancel')}
        </Button>
      </div>
    </div>
  )
}

/** A small number picker, so packs are chosen rather than typed blindly. */
export function PackPicker({
  value, onChange, max,
}: {
  value: number
  onChange: (n: number) => void
  max?: number
}) {
  return (
    <div className="row" style={{ marginTop: 10, gap: 6 }}>
      {[1, 2, 3].filter((n) => max === undefined || n <= max).map((n) => (
        <button
          key={n}
          type="button"
          className={`packbtn ${value === n ? 'packbtn--on' : ''}`}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

/** Local state for one confirm-guarded action. */
export function useConfirm() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  return {
    open,
    busy,
    error,
    ask: () => { setError(''); setOpen(true) },
    close: () => { setOpen(false); setError('') },
    setBusy,
    setError,
  }
}
