import { useState } from 'react'
import { Button, Field, TextInput, VoiceInput } from './ui.js'
import { useT } from '../i18n/I18nProvider.js'
import type { Address } from '@shared/types.js'
import type { AddressInput } from '../lib/api.js'

/**
 * Where she types a delivery address.
 *
 * Until now the app had no such form at all: checkout showed two seeded
 * addresses that belonged to nobody, and there was no way to add your own. So
 * this is the screen that makes a saved address possible.
 *
 * Voice input on the address line and landmark is not decoration. Typing a
 * Marathi address on a phone keyboard is the slowest thing we ask of her, and
 * it is the last step before an order - the worst place to lose someone.
 *
 * Only the line and the pincode are required. A label defaults to घर, and a
 * landmark is genuinely optional; asking for more up front costs more orders
 * than the tidier data is worth.
 */
export function AddressForm({
  initial,
  submitLabel,
  busy = false,
  onSubmit,
  onCancel,
}: {
  initial?: Address
  submitLabel?: string
  busy?: boolean
  onSubmit: (input: AddressInput) => void
  onCancel?: () => void
}) {
  const t = useT()
  const [label, setLabel] = useState(initial?.label ?? '')
  const [line, setLine] = useState(initial?.line ?? '')
  const [landmark, setLandmark] = useState(initial?.landmark ?? '')
  const [pincode, setPincode] = useState(initial?.pincode ?? '')
  const [errors, setErrors] = useState<{ line?: string; pincode?: string }>({})

  function submit() {
    const next: { line?: string; pincode?: string } = {}
    if (!line.trim()) next.line = t('cus.addressRequired')
    if (!/^\d{6}$/.test(pincode.trim())) next.pincode = t('cus.pincodeInvalid')

    setErrors(next)
    if (next.line || next.pincode) return

    onSubmit({
      label: label.trim() || undefined,
      line: line.trim(),
      landmark: landmark.trim() || undefined,
      pincode: pincode.trim(),
    })
  }

  return (
    <div className="stack-sm">
      <Field label={t('cus.addressLine')} hint={t('cus.addressLineHint')} error={errors.line} required>
        <VoiceInput
          value={line}
          onChange={setLine}
          placeholder={t('cus.addressLineHint')}
          multiline
        />
      </Field>

      <Field label={t('cus.landmark')} hint={t('cus.landmarkHint')}>
        <VoiceInput value={landmark} onChange={setLandmark} placeholder={t('cus.landmarkHint')} />
      </Field>

      <Field label={t('cus.pincode')} error={errors.pincode} required>
        <TextInput
          value={pincode}
          onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          error={Boolean(errors.pincode)}
          inputMode="numeric"
          placeholder="413601"
        />
      </Field>

      <Field label={t('cus.addressLabel')} hint={t('cus.addressLabelHint')}>
        <TextInput
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('cus.addressLabelHint')}
        />
      </Field>

      <Button onClick={submit} disabled={busy}>
        {busy ? t('common.loading') : (submitLabel ?? t('cus.saveAddress'))}
      </Button>

      {onCancel && (
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
      )}
    </div>
  )
}
