import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Category, Cultivation } from '@shared/types.js'
import { canSellNow } from '@shared/farmer.js'
import { cropById } from '@shared/crops.js'
import { categoryFor, listingProblems } from '@shared/produce.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { useAuth } from '../../store/AuthContext.js'
import { api, ApiError } from '../../lib/api.js'
import { useToast } from '../../store/ToastContext.js'
import PhotoPicker from '../../components/PhotoPicker.js'
import {
  BLANK, clearDraft, readDraft, writeDraft, type Draft,
} from './productDraft.js'
import ProductImage from '../../components/ProductImage.js'
import {
  CategoryPicker, CropPicker, CultivationPicker, CultivationPill, PricePerUnit, UnitPicker, todayIso,
  useHarvestLabel,
} from '../../components/Produce.js'
import {
  AppBar, Button, Card, Dots, EmptyState, Field,
  Loading, Notice, TextInput, VoiceInput, useAsync,
} from '../../components/ui.js'
import { IconBack, IconNext } from '../../components/icons.js'
import { PageTour } from '../../components/Walkthrough.js'

const STEPS = [
  'crop', 'photo', 'name', 'unit', 'price', 'quantity', 'harvest', 'cultivation', 'review',
] as const
type Step = (typeof STEPS)[number]

/** Which listing fields each step answers, so the shared rules can be asked one screen at a time. */
const STEP_FIELDS: Partial<Record<Step, string[]>> = {
  crop: ['cropId', 'categoryId'],
  name: ['name'],
  unit: ['unit'],
  price: ['price'],
  quantity: ['stock', 'minOrder'],
  harvest: ['harvestDate'],
  cultivation: ['cultivation'],
}

/**
 * The listing wizard. One question per screen.
 *
 * The crop comes first because it answers three things at once: the category
 * (the server derives it), a name to start from, and the picture a buyer
 * expects. Everything after it is a number or a tap. The rules for each
 * answer are `listingProblems` in shared/src/produce.ts - the same function
 * the server runs - so a screen that lets him past is one the server accepts.
 *
 * The NAME still takes voice input, because a farmer who speaks Marathi
 * fluently may be unable to type it on a phone keyboard.
 */
export default function UploadProduct() {
  const t = useT()
  const { lang } = useI18n()
  const nav = useNavigate()
  const { toast } = useToast()
  const { session } = useAuth()
  const harvested = useHarvestLabel()

  const [me, loadingMe] = useAsync(() => api.me(), [])
  const [catData] = useAsync(() => api.categories(), [])

  /* The draft belongs to ONE farmer. Read it from the session rather than
     from api.me(), which has not answered yet at first render - and a draft
     keyed on nothing is how a stranger's photo reached the next farmer to
     register on the same phone. */
  const farmerId = session?.farmerId

  const restored = useState(() => readDraft(localStorage, farmerId))[0]
  const [step, setStep] = useState(restored?.step ?? 0)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState('')

  /* Set when Cloudinary is off. There is nothing else to ask for then, so the
     photo step stops being a wall he cannot get past. */
  const [photoOff, setPhotoOff] = useState(false)

  const [d, setD] = useState<Draft>(restored?.d ?? BLANK)

  useEffect(() => {
    writeDraft(localStorage, farmerId, step, d)
  }, [farmerId, step, d])

  /* One route, nine screens. A step change is not a navigation, so nothing
     moves the scroll on its own and the next question opened at whatever
     height the last answer left - usually its own foot. */
  useEffect(() => { window.scrollTo(0, 0) }, [step])

  type Key = keyof typeof d
  const set = <K extends Key>(k: K, v: (typeof d)[K]) => {
    setD((cur) => ({ ...cur, [k]: v }))
    setErrors((e) => ({ ...e, [k]: '' }))
  }

  if (loadingMe) {
    return <><AppBar title={t('prod.add')} /><div className="screen"><Loading /></div></>
  }
  if (!me) {
    return <><AppBar title={t('prod.add')} /><div className="screen"><EmptyState title="—" /></div></>
  }

  const farmer = me.farmer

  /* Not verified yet (or blocked): the server would refuse to put anything
     on sale, so he is told here rather than at the last step. */
  if (!canSellNow(farmer)) {
    return (
      <>
        <AppBar title={t('prod.add')} />
        <div className="screen stack">
          {farmer.status === 'BLOCKED'
            ? <Notice tone="danger">{t('biz.blockedTitle')}</Notice>
            : <Notice tone="warn">{t('biz.pendingVerification')}</Notice>}
          <Button variant="ghost" onClick={() => nav('/farmer/products')}>{t('biz.myProducts')}</Button>
        </div>
      </>
    )
  }

  const categories: Category[] = catData?.categories ?? []
  const catLabel = (c: { mr: string; en: string }) => (lang === 'mr' ? c.mr : c.en)
  const cropLabel = (id: string) => {
    const crop = cropById(id)
    return crop ? catLabel(crop) : ''
  }

  /** The listing as it would be sent. */
  const listing = {
    cropId: d.cropId,
    categoryId: categoryFor(d.cropId, d.categoryId) ?? '',
    name: d.name.trim(),
    unit: d.unit,
    price: Number(d.price),
    stock: d.stock === '' ? NaN : Number(d.stock),
    minOrder: Number(d.minOrder),
    harvestDate: d.harvestDate,
    cultivation: (d.cultivation || undefined) as Cultivation | undefined,
  }

  function validate(which: Step): boolean {
    const all = listingProblems(listing)
    const e: Record<string, string> = {}
    for (const k of STEP_FIELDS[which] ?? []) if (all[k]) e[k] = all[k]!
    // `other` has no category of its own; he picks one on the same screen.
    if (which === 'crop' && d.cropId === 'other' && !d.categoryId) e.categoryId = t('common.required')
    if (which === 'photo' && !photoOff && !d.imageUrl) e.photo = t('common.required')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function next() {
    if (!validate(STEPS[step]!)) return
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  /**
   * Backwards never validates and never clears a field - `d` is one object
   * that outlives every step - so he can go back from the review, change the
   * price, and come forward to find everything else exactly as he left it.
   * The error markers are cleared, because a red box on a screen he is only
   * revisiting reads as a new mistake.
   */
  function goToStep(target: number) {
    setErrors({})
    setStep(Math.max(0, Math.min(STEPS.length - 1, target)))
  }

  function back() {
    if (step === 0) nav('/farmer')
    else goToStep(step - 1)
  }

  function pickCrop(id: string) {
    setD((cur) => ({
      ...cur,
      cropId: id,
      categoryId: id === 'other' ? cur.categoryId : '',
      // The crop's name is a starting point, not a decision: replaced only
      // while he has not written his own.
      name: !cur.name || cur.name === cropLabel(cur.cropId) ? (id === 'other' ? '' : cropLabel(id)) : cur.name,
    }))
    setErrors({})
  }

  async function publish(asDraft: boolean) {
    setBusy(true)
    setServerError('')
    try {
      await api.createProduct({
        ...listing,
        stock: Number(d.stock) || 0,
        cultivation: listing.cultivation,
        imageUrl: d.imageUrl || undefined,
        imagePublicId: d.imagePublicId || undefined,
        asDraft,
      })
      clearDraft(localStorage, farmerId)
      toast(t(asDraft ? 'ok.productDraft' : 'ok.productPublished'))
      nav('/farmer/products', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.messageMr ?? err.message)
        if (err.fields) setErrors(err.fields)
      } else {
        setServerError('Network error')
      }
    } finally {
      setBusy(false)
    }
  }

  const numeric = (k: 'price' | 'stock' | 'minOrder') => (e: { target: { value: string } }) =>
    set(k, e.target.value.replace(/\D/g, ''))

  return (
    <>
      <AppBar
        title={t('prod.add')}
        sub={`${t('reg.step')} ${step + 1} ${t('reg.of')} ${STEPS.length}`}
        onBack={back}
      />

      <div style={{ padding: '0 var(--s4)' }} data-wt="up-dots">
        <Dots step={step} total={STEPS.length} />
      </div>

      <div className="screen stack" data-wt="up-body">
        {/* ---------- 1. crop, grouped as the market is ---------- */}
        {STEPS[step] === 'crop' && (
          <>
            <Field label={t('prod.crop')} hint={t('prod.cropHint')} error={errors.cropId} required>
              <CropPicker value={d.cropId} onPick={pickCrop} categories={categories} />
            </Field>
            {d.cropId === 'other' && (
              <Field label={t('prod.otherCategory')} error={errors.categoryId} required>
                <CategoryPicker value={d.categoryId} onPick={(id) => set('categoryId', id)} categories={categories} />
              </Field>
            )}
          </>
        )}

        {/* ---------- 2. photo ---------------------------------- */}
        {STEPS[step] === 'photo' && (
          <Field
            label={t('prod.photos')}
            hint={t('prod.photosHint')}
            error={errors.photo}
            required={!photoOff}
          >
            <PhotoPicker
              imageUrl={d.imageUrl || undefined}
              onUploaded={(img) => {
                setD((cur) => ({ ...cur, imageUrl: img.url, imagePublicId: img.publicId }))
                setErrors((e) => ({ ...e, photo: '' }))
              }}
              onCleared={() => setD((cur) => ({ ...cur, imageUrl: '', imagePublicId: '' }))}
              onUnavailable={() => setPhotoOff(true)}
            />
          </Field>
        )}

        {/* ---------- 3. name, pre-filled, with VOICE TYPING ------ */}
        {STEPS[step] === 'name' && (
          <Field label={t('prod.name')} hint={t('prod.nameHint')} error={errors.name} required>
            <VoiceInput
              value={d.name}
              onChange={(v) => set('name', v)}
              error={!!errors.name}
              placeholder={t('prod.namePlaceholder')}
            />
          </Field>
        )}

        {/* ---------- 4. unit ----------------------------------- */}
        {STEPS[step] === 'unit' && (
          <Field label={t('prod.unit')} hint={t('prod.unitHint')} error={errors.unit} required>
            <UnitPicker value={d.unit} onPick={(u) => set('unit', u)} />
          </Field>
        )}

        {/* ---------- 5. price for ONE unit ---------------------- */}
        {STEPS[step] === 'price' && (
          <Field label={t('prod.price')} hint={t('prod.priceHint')} error={errors.price} required htmlFor="price">
            <div className="row" style={{ gap: 'var(--s2)' }}>
              <TextInput
                id="price"
                inputMode="numeric"
                value={d.price}
                error={!!errors.price}
                onChange={numeric('price')}
                placeholder={t('ph.price')}
              />
              <strong style={{ flex: 'none' }}>/ {t(`unit.${d.unit}`)}</strong>
            </div>
          </Field>
        )}

        {/* ---------- 6. how much, and the smallest order -------- */}
        {STEPS[step] === 'quantity' && (
          <>
            <Field label={t('prod.stock')} hint={t('prod.stockHint')} error={errors.stock} required htmlFor="stock">
              <div className="row" style={{ gap: 'var(--s2)' }}>
                <TextInput
                  id="stock"
                  inputMode="numeric"
                  value={d.stock}
                  error={!!errors.stock}
                  onChange={numeric('stock')}
                  placeholder={t('ph.stock')}
                />
                <strong style={{ flex: 'none' }}>{t(`unit.${d.unit}`)}</strong>
              </div>
            </Field>
            <Field label={t('prod.minOrder')} hint={t('prod.minOrderHint')} error={errors.minOrder} required htmlFor="minOrder">
              <div className="row" style={{ gap: 'var(--s2)' }}>
                <TextInput
                  id="minOrder"
                  inputMode="numeric"
                  value={d.minOrder}
                  error={!!errors.minOrder}
                  onChange={numeric('minOrder')}
                  placeholder="1"
                />
                <strong style={{ flex: 'none' }}>{t(`unit.${d.unit}`)}</strong>
              </div>
            </Field>
          </>
        )}

        {/* ---------- 7. harvest date ---------------------------- */}
        {STEPS[step] === 'harvest' && (
          <Field label={t('prod.harvestDate')} hint={t('prod.harvestDateHint')} error={errors.harvestDate} required htmlFor="harvestDate">
            <TextInput
              id="harvestDate"
              type="date"
              max={todayIso()}
              value={d.harvestDate}
              error={!!errors.harvestDate}
              onChange={(e) => set('harvestDate', e.target.value)}
            />
          </Field>
        )}

        {/* ---------- 8. how it was grown ------------------------ */}
        {STEPS[step] === 'cultivation' && (
          <Field label={t('prod.cultivation')} error={errors.cultivation} required>
            <CultivationPicker value={d.cultivation} onPick={(c) => set('cultivation', c)} />
          </Field>
        )}

        {/* ---------- 9. review ---------------------------------- */}
        {STEPS[step] === 'review' && (
          <>
            <div className="section-title">{t('prod.preview')}</div>
            <p className="small muted" style={{ margin: 0 }}>{t('reg.reviewHint')}</p>

            {/* Straight back to the screen that asked, with everything he has
                already typed still in place. */}
            <div className="wrap-row">
              {([
                ['crop', t('prod.crop')],
                ['photo', t('prod.photos')],
                ['name', t('prod.name')],
                ['price', t('prod.price')],
                ['quantity', t('prod.stock')],
                ['harvest', t('prod.harvestDate')],
                ['cultivation', t('prod.cultivation')],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className="chip"
                  onClick={() => goToStep(STEPS.indexOf(key))}
                >
                  {label} · {t('common.edit')}
                </button>
              ))}
            </div>

            <Card>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <ProductImage
                  src={d.imageUrl || undefined}
                  categoryId={listing.categoryId}
                  size={80}
                  className="tile__img"
                />
                <div className="stack-sm grow" style={{ gap: 4 }}>
                  <strong style={{ fontSize: 'var(--t-md)' }}>{d.name}</strong>
                  <PricePerUnit price={listing.price} unit={d.unit} />
                  <div className="small dim">{harvested(d.harvestDate)}</div>
                  <div className="small">
                    {t('prod.inStock')}: {d.stock} {t(`unit.${d.unit}`)}
                    {listing.minOrder > 1 && <> · {t('prod.minOrderShort', { n: listing.minOrder, unit: t(`unit.${d.unit}`) })}</>}
                  </div>
                  {d.cultivation && <CultivationPill cultivation={d.cultivation} />}
                </div>
              </div>
            </Card>

            <Notice tone="ok">{t('prod.liveNow')}</Notice>

            {/* Said at the moment he commits, not buried in a policy page.
                Publishing is his now; this is the other half of that. */}
            <Notice tone="warn">{t('prod.responsibility')}</Notice>

            {serverError && <Notice tone="danger">{serverError}</Notice>}
          </>
        )}
      </div>

      <div className="actionbar" data-wt="up-next">
        {step < STEPS.length - 1 ? (
          <div className="btn-row">
            <Button variant="quiet" onClick={back}>
              <IconBack aria-hidden="true" /> {t('common.back')}
            </Button>
            <Button onClick={next}>
              {t('common.next')} <IconNext aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <>
            <Button onClick={() => void publish(false)} disabled={busy}>
              {busy ? t('common.loading') : t('upl.publish')}
            </Button>
            <div className="btn-row">
              <Button variant="quiet" onClick={back}>
                <IconBack aria-hidden="true" /> {t('common.back')}
              </Button>
              <Button variant="quiet" onClick={() => void publish(true)} disabled={busy}>
                {t('prod.saveDraft')}
              </Button>
            </div>
          </>
        )}
      </div>

      <PageTour id="farmer.upload" />
    </>
  )
}
