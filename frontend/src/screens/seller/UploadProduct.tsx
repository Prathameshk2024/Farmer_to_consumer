import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Category, Unit } from '@shared/types.js'
import { needsPieceCount, slotInfo } from '@shared/seller.js'
import { sizeLabel } from '../../lib/productSize.js'
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
  AppBar, Button, Card, Choice, Dots, EmptyState, Field,
  Loading, Notice, Rupees, TextInput, VoiceInput, useAsync,
} from '../../components/ui.js'
import {
  IconBack, IconFood, IconLock, IconNext, IconProduct, IconWaiting, VegMark,
} from '../../components/icons.js'
import { PageTour } from '../../components/Walkthrough.js'

const UNITS: Unit[] = ['kg', 'g', 'piece', 'dozen', 'litre', 'ml', 'set']
const STEPS = ['photo', 'basics', 'food', 'details', 'price', 'stock', 'preview'] as const

/**
 * The upload wizard. One question per screen, one photo from her gallery.
 *
 * Step 3 is the branch everything depends on: food asks for the ingredients
 * and veg/non-veg, non-food asks what it is made of. Every extra field is a
 * place a first-time seller abandons.
 *
 * The product NAME uses voice input, because a seller who speaks Marathi
 * fluently may still be unable to type it on a phone keyboard.
 */
export default function UploadProduct() {
  const t = useT()
  const { lang } = useI18n()
  const nav = useNavigate()
  const { toast } = useToast()
  const { session } = useAuth()

  const [me, loadingMe] = useAsync(() => api.me(), [])
  const [productData, loadingProducts] = useAsync(() => api.myProducts(), [])
  const [catData] = useAsync(() => api.categories(), [])

  /* The draft belongs to ONE seller. Read it from the session rather than
     from api.me(), which has not answered yet at first render - and a draft
     keyed on nothing is how a stranger's photo reached the next woman to
     register on the same phone. */
  const sellerId = session?.sellerId

  const restored = useState(() => readDraft(localStorage, sellerId))[0]
  const [step, setStep] = useState(restored?.step ?? 0)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState('')

  /* Set when Cloudinary is off. There is nothing else to ask for then, so the
     photo step stops being a wall she cannot get past. */
  const [photoOff, setPhotoOff] = useState(false)

  const [d, setD] = useState<Draft>(restored?.d ?? BLANK)

  useEffect(() => {
    writeDraft(localStorage, sellerId, step, d)
  }, [sellerId, step, d])

  /* One route, seven screens. A step change is not a navigation, so nothing
     moves the scroll on its own and the next question opened at whatever
     height the last answer left - usually its own foot. */
  useEffect(() => { window.scrollTo(0, 0) }, [step])


  type Key = keyof typeof d
  const set = <K extends Key>(k: K, v: (typeof d)[K]) => {
    setD((cur) => ({ ...cur, [k]: v }))
    setErrors((e) => ({ ...e, [k]: '' }))
  }

  if (loadingMe || loadingProducts) {
    return <><AppBar title={t('prod.add')} /><div className="screen"><Loading /></div></>
  }
  if (!me) {
    return <><AppBar title={t('prod.add')} /><div className="screen"><EmptyState title="—" /></div></>
  }

  const seller = me.seller
  const products = productData?.products ?? []
  const slots = slotInfo(seller, products)

  /* Gate 1: not approved yet. */
  if (seller.status !== 'ACTIVE') {
    return (
      <>
        <AppBar title={t('prod.add')} />
        <div className="screen">
          <Card>
            <EmptyState
              icon={IconWaiting}
              title={t('wait.sub')}
              body={t('wait.canDoMeanwhile')}
              action={<Button onClick={() => nav('/seller/subscription')}>{t('pay.title')}</Button>}
            />
          </Card>
        </div>
      </>
    )
  }

  /* Gate 1b: the six months ran out. Sending a listing in waits for the
     renewal, like everything else a buyer would see - the server refuses it
     too, so she is told here rather than at the last step. */
  if (me.subscription?.state === 'expired') {
    return (
      <>
        <AppBar title={t('prod.add')} />
        <div className="screen">
          <Card>
            <EmptyState
              icon={IconLock}
              title={t('sub.uploadBlocked')}
              body={t('sub.uploadBlockedSub')}
              action={<Button onClick={() => nav('/seller/subscription')}>{t('sub.renewButton')}</Button>}
            />
          </Card>
        </div>
      </>
    )
  }

  /* Gate 2: slots full. An opportunity, never an error. */
  if (slots.isFull) {
    return (
      <>
        <AppBar title={t('prod.add')} />
        <div className="screen">
          <Card>
            <EmptyState
              icon={IconLock}
              title={t('prod.slotsFullTitle')}
              body={t('prod.slotsFullBody')}
              action={
                <div className="stack-sm" style={{ width: '100%' }}>
                  <Button onClick={() => nav('/seller/subscription')}>{t('prof.buyMore')}</Button>
                  <Button variant="ghost" onClick={() => nav('/seller/products')}>
                    {t('biz.myProducts')}
                  </Button>
                </div>
              }
            />
          </Card>
        </div>
      </>
    )
  }

  const categories: Category[] = catData?.categories ?? []
  // A category with no `food` flag belongs to both halves - that is `other`,
  // and it has to be reachable whichever answer she gave on the food step.
  const visibleCats = categories.filter(
    (c) => d.isFood === null || c.food === undefined || c.food === d.isFood,
  )

  function validate(which: (typeof STEPS)[number]): boolean {
    const e: Record<string, string> = {}
    if (which === 'photo' && !photoOff && !d.imageUrl) e.photo = t('common.required')
    if (which === 'basics' && !d.name.trim()) e.name = t('common.required')
    if (which === 'food' && d.isFood === null) e.isFood = t('common.required')
    if (which === 'details') {
      if (!d.categoryId) e.categoryId = t('common.required')
      if (d.isFood) {
        if (!d.ingredients.trim()) e.ingredients = t('common.required')
        if (!d.vegType) e.vegType = t('common.required')
      } else if (!d.material.trim()) {
        e.material = t('common.required')
      }
    }
    if (which === 'price') {
      if (!d.price || Number(d.price) <= 0) e.price = t('common.required')
      if (!d.packSize || Number(d.packSize) <= 0) e.packSize = t('common.required')
      if (needsPieceCount(d.unit) && (!d.piecesPerPack || Number(d.piecesPerPack) <= 0)) {
        e.piecesPerPack = t('common.required')
      }
    }
    // Made-to-order is an answer, so it satisfies the question. A woman who
    // cooks each order fresh has no shelf to count.
    if (which === 'stock' && !d.madeToOrder && d.stock === '') e.stock = t('common.required')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function next() {
    if (!validate(STEPS[step]!)) return
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  /**
   * Backwards never validates and never clears a field - `d` is one object
   * that outlives every step - so she can go back from the preview, change the
   * price, and come forward to find everything else exactly as she left it.
   * The error markers are cleared, because a red box on a screen she is only
   * revisiting reads as a new mistake.
   */
  function goToStep(target: number) {
    setErrors({})
    setStep(Math.max(0, Math.min(STEPS.length - 1, target)))
  }

  function back() {
    if (step === 0) nav('/seller')
    else goToStep(step - 1)
  }

  async function publish(asDraft: boolean) {
    setBusy(true)
    setServerError('')
    try {
      await api.createProduct({
        emoji: '📦',
        imageUrl: d.imageUrl || undefined,
        imagePublicId: d.imagePublicId || undefined,
        name: d.name.trim(),
        categoryId: d.categoryId,
        isFood: !!d.isFood,
        ingredients: d.isFood ? d.ingredients : undefined,
        vegType: d.isFood && d.vegType ? d.vegType : undefined,
        material: d.isFood ? undefined : d.material,
        price: Number(d.price),
        mrp: Number(d.mrp) || 0,
        unit: d.unit,
        packSize: Number(d.packSize) || undefined,
        piecesPerPack: needsPieceCount(d.unit) ? Number(d.piecesPerPack) || undefined : undefined,
        stock: d.madeToOrder ? 0 : Number(d.stock),
        madeToOrder: d.madeToOrder,
        asDraft,
      })
      clearDraft(localStorage, sellerId)
      toast(t(asDraft ? 'ok.productDraft' : 'ok.productPublished'))
      nav('/seller/products', { replace: true })
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
        {/* ---------- 1. photo ---------------------------------- */}
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

        {/* ---------- 2. name, with VOICE TYPING ----------------- */}
        {STEPS[step] === 'basics' && (
          <Field label={t('prod.name')} hint={t('prod.nameHint')} error={errors.name} required>
            <VoiceInput
              value={d.name}
              onChange={(v) => set('name', v)}
              error={!!errors.name}
              placeholder={t('prod.namePlaceholder')}
            />
          </Field>
        )}

        {/* ---------- 3. THE BRANCH ------------------------------ */}
        {STEPS[step] === 'food' && (
          <Field label={t('prod.isFood')} error={errors.isFood} required>
            <div className="stack-sm">
              <Choice
                selected={d.isFood === true}
                onSelect={() => { set('isFood', true); set('categoryId', '') }}
                icon={<IconFood />}
                title={t('prod.isFoodYes')}
                sub={t('reg.sellsFoodHint')}
              />
              <Choice
                selected={d.isFood === false}
                onSelect={() => { set('isFood', false); set('categoryId', '') }}
                icon={<IconProduct />}
                title={t('prod.isFoodNo')}
              />
            </div>
          </Field>
        )}

        {/* ---------- 4. four fields for food, one for not ------- */}
        {STEPS[step] === 'details' && (
          <>
            <Field label={t('prod.category')} error={errors.categoryId} required>
              <div className="wrap-row">
                {visibleCats.map((c) => (
                  <button
                    key={c.id}
                    className={`chip ${d.categoryId === c.id ? 'chip--on' : ''}`}
                    onClick={() => set('categoryId', c.id)}
                  >
                    {lang === 'mr' ? c.mr : c.en}
                  </button>
                ))}
              </div>
            </Field>

            {d.isFood ? (
              <>

                <Field label={t('prod.ingredients')} hint={t('prod.ingredientsHint')} error={errors.ingredients} required>
                  <VoiceInput
                    value={d.ingredients}
                    onChange={(v) => set('ingredients', v)}
                    error={!!errors.ingredients}
                    multiline
                    placeholder={t('ph.ingredients')}
                  />
                </Field>

                <Field label={t('prod.vegType')} error={errors.vegType} required>
                  <div className="yesno">
                    <Choice selected={d.vegType === 'veg'} onSelect={() => set('vegType', 'veg')} icon={<VegMark type="veg" />} title={t('prod.veg')} />
                    <Choice selected={d.vegType === 'nonveg'} onSelect={() => set('vegType', 'nonveg')} icon={<VegMark type="nonveg" />} title={t('prod.nonveg')} />
                  </div>
                </Field>
              </>
            ) : (
              <Field label={t('prod.material')} hint={t('prod.materialHint')} error={errors.material} required>
                <VoiceInput
                  value={d.material}
                  onChange={(v) => set('material', v)}
                  error={!!errors.material}
                  multiline
                  placeholder={t('ph.material')}
                />
                <div className="wrap-row" style={{ marginTop: 'var(--s2)' }}>
                  {/* The word she taps is the word that gets stored, so it
                      follows the language she is reading in. */}
                  {['cotton', 'silk', 'wool', 'clay', 'wood', 'brass', 'bamboo', 'jute'].map((m) => (
                    <button
                      key={m}
                      className="chip"
                      onClick={() => set('material', t(`mat.${m}`))}
                    >
                      {t(`mat.${m}`)}
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </>
        )}

        {/* ---------- 5. price ---------------------------------- */}
        {STEPS[step] === 'price' && (
          <>
            <Field label={t('prod.price')} hint={t('prod.priceHint')} error={errors.price} required htmlFor="price">
              <TextInput
                id="price"
                inputMode="numeric"
                value={d.price}
                error={!!errors.price}
                onChange={(e) => set('price', e.target.value.replace(/\D/g, ''))}
                placeholder="220"
              />
            </Field>
            <Field label={`${t('prod.mrp')} (${t('common.optional')})`} htmlFor="mrp">
              <TextInput
                id="mrp"
                inputMode="numeric"
                value={d.mrp}
                onChange={(e) => set('mrp', e.target.value.replace(/\D/g, ''))}
                placeholder="250"
              />
            </Field>
            <Field label={t('prod.unit')} required>
              <div className="wrap-row">
                {UNITS.map((u) => (
                  <button
                    key={u}
                    className={`chip ${d.unit === u ? 'chip--on' : ''}`}
                    onClick={() => set('unit', u)}
                  >
                    {t(`unit.${u}`)}
                  </button>
                ))}
              </div>
            </Field>

            {/* The size the price is FOR. Asked next to the unit she has just
                chosen, so the two read as one answer: "500" then "ग्रॅम". */}
            <Field
              label={t('prod.packSize')}
              hint={t('prod.packSizeHint')}
              error={errors.packSize}
              required
              htmlFor="packSize"
            >
              <div className="row" style={{ gap: 'var(--s2)' }}>
                <TextInput
                  id="packSize"
                  inputMode="numeric"
                  value={d.packSize}
                  error={!!errors.packSize}
                  onChange={(e) => set('packSize', e.target.value.replace(/\D/g, ''))}
                  placeholder="500"
                />
                <strong style={{ flex: 'none' }}>{t(`unit.${d.unit}`)}</strong>
              </div>
            </Field>

            {/* A set of four ladoos and a set of twenty are the same word. */}
            {needsPieceCount(d.unit) && (
              <Field
                label={t('prod.piecesPerPack')}
                hint={t('prod.piecesPerPackHint')}
                error={errors.piecesPerPack}
                required
                htmlFor="piecesPerPack"
              >
                <TextInput
                  id="piecesPerPack"
                  inputMode="numeric"
                  value={d.piecesPerPack}
                  error={!!errors.piecesPerPack}
                  onChange={(e) => set('piecesPerPack', e.target.value.replace(/\D/g, ''))}
                  placeholder="6"
                />
              </Field>
            )}
          </>
        )}

        {/* ---------- 6. how many ------------------------------- */}
        {STEPS[step] === 'stock' && (
          <>
            <Field label={t('prod.stock')} hint={t('prod.stockHint')} error={errors.stock} required htmlFor="stock">
              <TextInput
                id="stock"
                inputMode="numeric"
                value={d.stock}
                error={!!errors.stock}
                disabled={d.madeToOrder}
                onChange={(e) => set('stock', e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="10"
              />
            </Field>

            {/* The other honest answer: she makes it when the order comes. */}
            <Choice
              selected={d.madeToOrder}
              onSelect={() => set('madeToOrder', !d.madeToOrder)}
              icon={<IconWaiting />}
              title={t('prod.madeToOrder')}
              sub={t('prod.madeToOrderHint')}
            />
          </>
        )}

        {/* ---------- 7. preview -------------------------------- */}
        {STEPS[step] === 'preview' && (
          <>
            <div className="section-title">{t('prod.preview')}</div>
            <p className="small muted" style={{ margin: 0 }}>{t('reg.reviewHint')}</p>

            {/* Straight back to the screen that asked, with everything she has
                already typed still in place. */}
            <div className="wrap-row">
              {([
                ['photo', t('prod.photos')],
                ['basics', t('prod.name')],
                ['details', t('prod.category')],
                ['price', t('prod.price')],
                ['stock', t('prod.stock')],
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
                  categoryId={d.categoryId}
                  size={80}
                  className="tile__img"
                />
                <div className="stack-sm grow" style={{ gap: 4 }}>
                  <strong style={{ fontSize: 'var(--t-md)' }}>{d.name}</strong>
                  <div className="row" style={{ gap: 8 }}>
                    <strong style={{ fontSize: 'var(--t-lg)' }}><Rupees value={Number(d.price)} /></strong>
                    <span className="small dim">
                      / {sizeLabel(
                        {
                          unit: d.unit,
                          packSize: Number(d.packSize) || undefined,
                          piecesPerPack: Number(d.piecesPerPack) || undefined,
                        },
                        t,
                      )}
                    </span>
                  </div>
                  {d.isFood && d.vegType && (
                    <span className={`pill pill--${d.vegType === 'veg' ? 'ok' : 'danger'}`}>
                      <VegMark type={d.vegType} />{' '}
                      {d.vegType === 'veg' ? t('prod.veg') : t('prod.nonveg')}
                    </span>
                  )}
                </div>
              </div>

              <hr className="divider" />

              {d.isFood ? (
                <div className="stack-sm small">
                  <div><span className="dim">{t('cus.ingredients')}: </span>{d.ingredients}</div>
                </div>
              ) : (
                <div className="small"><span className="dim">{t('cus.material')}: </span>{d.material}</div>
              )}
            </Card>

            <Notice tone="ok" title={t('prod.liveNow')}>
              {t('prod.willUseSlot', { used: slots.used + 1, total: slots.total })}
            </Notice>

            {/* Said at the moment she commits, not buried in a policy page.
                Publishing is hers now; this is the other half of that. */}
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
            {/* An admin publishes it, not this button. Saying so here stops
                her refreshing the shop looking for a listing nobody has
                approved yet. */}
            <div className="small dim" style={{ textAlign: 'center' }}>{t('prod.reviewNote')}</div>
            <Button onClick={() => void publish(false)} disabled={busy}>
              {busy ? t('common.loading') : t('prod.publish')}
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

      <PageTour id="seller.upload" />
    </>
  )
}
