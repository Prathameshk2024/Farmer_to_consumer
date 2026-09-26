import { Suspense, lazy, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Farmer } from '@shared/types.js'
import { CROPS } from '@shared/crops.js'
import { AGE_GROUPS, EDUCATION_LEVELS, FARMER_TYPES, LANDHOLDINGS } from '@shared/profile.js'
import { PICKUP_PLACE_MAX, validateFarmerProfile } from '@shared/farmer.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { api, ApiError } from '../../lib/api.js'
import { useToast } from '../../store/ToastContext.js'
import PhotoPicker from '../../components/PhotoPicker.js'
import {
  AppBar, Button, Card, Choice, Field, LocationButton, Loading, Notice, SectionTitle,
  TextInput, VoiceInput, useAsync,
} from '../../components/ui.js'
import { IconBack, IconCheck, IconDelivery, IconFarm } from '../../components/icons.js'

const MapView = lazy(() => import('../../components/MapView.js'))

/**
 * The exact point, shown back to the farmer who set it, so a location taken
 * from the wrong field or the town office can be seen and set again. Buyers
 * only ever get it rounded. Its own component so the one-pin list is memoised
 * on the coordinates and typing elsewhere on the page does not refit the map.
 */
function OwnPoint({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const pins = useMemo(() => [{ id: 'me', lat, lng, label }], [lat, lng, label])
  return (
    <Suspense fallback={<Loading />}>
      <MapView pins={pins} height={200} center={[lat, lng]} label={label} />
    </Suspense>
  )
}

/**
 * EDITING THEIR OWN DETAILS, AFTER REGISTRATION
 * ===========================================
 * Registration was a one-way door. Everything they typed on those six screens -
 * their name, their shop's name, the description a customer reads, their payment QR -
 * was fixed the moment they pressed submit, and a farmer who mistyped their shop
 * name had no way to correct it from inside the app.
 *
 * WHAT IS NOT HERE, AND WHY
 * The server's allow-list on PATCH /farmers/me is what actually decides this;
 * the form only offers what that list already accepts. Missing on purpose:
 *
 *  - their PHONE, because it is their account. Changing it is changing who you
 *    are signed in as, and that is an admin's job after a call, not a text box;
 *  - their VILLAGE and their farmer code, because the ID is printed on their packaging
 *    and their poster. Re-issuing it silently would leave the number on a jar in
 *    somebody's kitchen pointing at nothing;
 *  - their STATUS, which is the admin's to set. A form that could set it would
 *    be a form that verifies itself.
 *
 * Their UPI id is editable, and the server clears `upiVerified` when it changes.
 *
 * THE LOCATION is not part of Save. It goes to its own route the moment the
 * farmer taps "change my location" or "remove location", because that tap is
 * the consent - a location carried along with an unrelated save would not be.
 */

type Opt = { value: string; mr: string; en: string }
const CROP_OPTS: Opt[] = CROPS.map((c) => ({ value: c.id, mr: c.mr, en: c.en }))
const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
export default function EditProfile() {
  const t = useT()
  const { lang } = useI18n()
  const nav = useNavigate()
  const { toast } = useToast()
  const [me, loading, setMe] = useAsync(() => api.me(), [])
  const [locBusy, setLocBusy] = useState(false)

  const [form, setForm] = useState<null | {
    name: string
    shopName: string
    about: string
    whatsapp: string
    ageGroup: string
    education: string
    landholding: string
    farmerTypes: string[]
    crops: string[]
    upiId: string
    upiQrUrl: string
    offersDelivery: boolean
    pickupOn: boolean
    pickupPlace: string
  }>(null)

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  if (loading || !me) {
    return <><AppBar title={t('prof.edit')} backTo="/farmer/profile" /><div className="screen"><Loading /></div></>
  }

  const farmer: Farmer = me.farmer

  // Seeded from the record on first render, not from a useEffect: the fetch has
  // already resolved by the time this runs, and an effect would flash an empty
  // form first.
  const f = form ?? {
    name: farmer.name,
    shopName: farmer.shopName,
    about: farmer.about ?? '',
    whatsapp: farmer.whatsapp ?? '',
    ageGroup: farmer.ageGroup ?? '',
    education: farmer.education ?? '',
    landholding: farmer.landholding ?? '',
    farmerTypes: farmer.farmerTypes ?? [],
    crops: farmer.crops ?? [],
    upiId: farmer.upiId,
    upiQrUrl: farmer.upiQrUrl ?? '',
    // A row from before the choice existed delivered.
    offersDelivery: farmer.offersDelivery ?? true,
    pickupOn: !!farmer.pickup,
    pickupPlace: farmer.pickup?.place ?? '',
  }

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setForm({ ...f, [k]: v })
    setErrors((e) => ({ ...e, [k]: '' }))
    setSaved(false)
  }

  async function save() {
    const e: Record<string, string> = {}
    if (!f.name.trim()) e.name = t('common.required')
    if (!f.shopName.trim()) e.shopName = t('common.required')
    if (f.crops.length === 0) e.crops = t('reg.cropsRequired')
    // Kept from the record: the place text is theirs to change here, the point is not.
    const pickup = f.pickupOn
      ? { place: f.pickupPlace.trim(), ...(farmer.pickup?.lat != null ? { lat: farmer.pickup.lat, lng: farmer.pickup.lng } : {}) }
      : undefined
    // The same rule the server runs, so they see it under the box, not after Save.
    Object.assign(e, validateFarmerProfile({ offersDelivery: f.offersDelivery, pickup }))
    setErrors(e)
    if (Object.keys(e).length) return

    setBusy(true)
    setErr('')
    try {
      await api.updateMe({
        name: f.name.trim(),
        shopName: f.shopName.trim(),
        about: f.about.trim() || undefined,
        whatsapp: f.whatsapp || undefined,
        // Cleaned against the same lists on the server; an unknown code is dropped.
        ageGroup: (f.ageGroup || undefined) as Farmer['ageGroup'],
        education: (f.education || undefined) as Farmer['education'],
        landholding: (f.landholding || undefined) as Farmer['landholding'],
        farmerTypes: f.farmerTypes as Farmer['farmerTypes'],
        crops: f.crops,
        upiId: f.upiId.trim(),
        upiQrUrl: f.upiQrUrl || undefined,
        upiQrReady: !!f.upiQrUrl,
        offersDelivery: f.offersDelivery,
        pickup: pickup ?? null,
      })
      setSaved(true)
      toast(t('ok.profileSaved'))
    } catch (error) {
      if (error instanceof ApiError) {
        setErr(error.messageMr ?? error.message)
        if (error.fields) setErrors(error.fields)
      } else {
        setErr('Network error')
      }
    } finally {
      setBusy(false)
    }
  }

  /** Sent at once: the tap on the button is the consent. */
  async function saveLocation(body: { lat: number; lng: number } | { clear: true }) {
    setLocBusy(true)
    setErr('')
    try {
      const res = await api.setMyLocation(body)
      setMe({ farmer: res.farmer })
      toast('clear' in body ? t('reg.locationRemoved') : t('reg.locationSaved'))
    } catch (error) {
      setErr(error instanceof ApiError ? error.messageMr ?? error.message : 'Network error')
    } finally {
      setLocBusy(false)
    }
  }

  const label = (o: Opt) => o[lang]
  const choices = (list: readonly Opt[], chosen: string, key: 'ageGroup' | 'education' | 'landholding') => (
    <div className="stack-sm">
      {list.map((o) => (
        <Choice key={o.value} selected={chosen === o.value} onSelect={() => set(key, o.value)} title={label(o)} />
      ))}
    </div>
  )
  const chips = (list: readonly Opt[], chosen: string[], key: 'farmerTypes' | 'crops') => (
    <div className="wrap-row">
      {list.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={chosen.includes(o.value)}
          className={`chip ${chosen.includes(o.value) ? 'chip--on' : ''}`}
          onClick={() => set(key, toggle(chosen, o.value))}
        >
          {label(o)}
        </button>
      ))}
    </div>
  )

  return (
    <>
      <AppBar title={t('prof.edit')} backTo="/farmer/profile" />
      <div className="screen stack">
        {saved && <Notice tone="ok">{t('prof.saved')}</Notice>}
        {err && <Notice tone="danger">{err}</Notice>}

        <Card>
          <SectionTitle>{t('reg.s1')}</SectionTitle>
          <div className="stack-sm">
            <Field label={t('reg.name')} error={errors.name} required>
              <VoiceInput value={f.name} onChange={(v) => set('name', v)} error={!!errors.name} />
            </Field>
            <Field label={`${t('reg.whatsapp')} (${t('common.optional')})`} htmlFor="wa">
              <TextInput
                id="wa" inputMode="numeric" maxLength={10} value={f.whatsapp}
                onChange={(e) => set('whatsapp', e.target.value.replace(/[^0-9]/g, ''))}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <SectionTitle>{t('reg.s6')}</SectionTitle>
          <div className="stack-sm">
            <Field label={t('reg.age')}>{choices(AGE_GROUPS, f.ageGroup, 'ageGroup')}</Field>
            <Field label={t('reg.education')}>{choices(EDUCATION_LEVELS, f.education, 'education')}</Field>
            <Field label={t('reg.landholding')}>{choices(LANDHOLDINGS, f.landholding, 'landholding')}</Field>
            <Field label={t('reg.farmerTypes')} hint={t('reg.pickMany')}>
              {chips(FARMER_TYPES, f.farmerTypes, 'farmerTypes')}
            </Field>
          </div>
        </Card>

        <Card>
          <SectionTitle>{t('prof.business')}</SectionTitle>
          <div className="stack-sm">
            <Field label={t('reg.shopName')} error={errors.shopName} required>
              <VoiceInput value={f.shopName} onChange={(v) => set('shopName', v)} error={!!errors.shopName} />
            </Field>
            <Field label={t('reg.about')} hint={t('reg.aboutHint')}>
              <VoiceInput value={f.about} onChange={(v) => set('about', v)} multiline />
            </Field>
            <Field label={t('reg.crops')} hint={t('reg.pickMany')} error={errors.crops} required>
              {chips(CROP_OPTS, f.crops, 'crops')}
            </Field>
          </div>
        </Card>

        <Card>
          <SectionTitle>{t('prof.fulfilment')}</SectionTitle>
          <div className="stack-sm">
            <Choice
              selected={f.offersDelivery}
              onSelect={() => set('offersDelivery', !f.offersDelivery)}
              icon={<IconDelivery />}
              title={t('prof.offersDelivery')}
            />
            <Choice
              selected={f.pickupOn}
              onSelect={() => set('pickupOn', !f.pickupOn)}
              icon={<IconFarm />}
              title={t('prof.offersPickup')}
            />
            {f.pickupOn && (
              <Field label={t('prof.pickupPlace')} error={errors.pickupPlace} required>
                <VoiceInput
                  value={f.pickupPlace}
                  onChange={(v) => set('pickupPlace', v.slice(0, PICKUP_PLACE_MAX))}
                  placeholder={t('prof.pickupPlacePh')}
                  error={!!errors.pickupPlace}
                />
              </Field>
            )}
            {errors.fulfilment && <Notice tone="danger">{errors.fulfilment}</Notice>}
          </div>
        </Card>

        <Card>
          <SectionTitle>{t('reg.location')}</SectionTitle>
          <div className="stack-sm">
            <p className="small" style={{ margin: 0 }}>{t('reg.locationWhy')}</p>
            {farmer.locationConsent && (
              <Notice tone="ok"><IconCheck aria-hidden="true" /> {t('reg.locationOn')}</Notice>
            )}
            {farmer.locationConsent && farmer.lat != null && farmer.lng != null && (
              <OwnPoint lat={farmer.lat} lng={farmer.lng} label={t('map.yourPoint')} />
            )}
            <LocationButton
              label={t(farmer.locationConsent ? 'reg.locationChange' : 'reg.useLocation')}
              onFound={(p) => void saveLocation(p)}
            />
            {farmer.locationConsent && (
              <Button variant="ghost" disabled={locBusy} onClick={() => void saveLocation({ clear: true })}>
                {t('reg.locationRemove')}
              </Button>
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle>{t('prof.payment')}</SectionTitle>
          <div className="stack-sm">
            {/* Changing this clears their verified mark on the server, which is
                the point: an unverified handle must not look checked. */}
            <Field label={t('reg.upiLabel')} hint={t('reg.upiWhere')} error={errors.upiId} htmlFor="upi">
              <TextInput
                id="upi" value={f.upiId} error={!!errors.upiId}
                autoCapitalize="none" autoCorrect="off" spellCheck={false}
                onChange={(e) => set('upiId', e.target.value.trim())}
              />
            </Field>
            <Field label={t('reg.upiQr')} hint={t('reg.upiQrHint')}>
              <PhotoPicker
                imageUrl={f.upiQrUrl || undefined}
                onUploaded={(img) => set('upiQrUrl', img.url)}
                onCleared={() => set('upiQrUrl', '')}
              />
            </Field>
          </div>
        </Card>

        {/* What they cannot change here, said plainly rather than left as a
            missing field they hunt for. */}
        <Notice tone="info">{t('prof.editLocked')}</Notice>
      </div>

      <div className="actionbar">
        <div className="btn-row">
          <Button variant="quiet" onClick={() => nav('/farmer/profile')}>
            <IconBack aria-hidden="true" /> {t('common.back')}
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      </div>
    </>
  )
}
