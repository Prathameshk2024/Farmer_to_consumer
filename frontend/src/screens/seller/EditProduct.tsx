import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Category, Product, Unit } from '@shared/types.js'
import {
  countsAsEdit, editsAreLimited, editsLeft, needsPieceCount,
} from '@shared/seller.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { api, ApiError } from '../../lib/api.js'
import { useToast } from '../../store/ToastContext.js'
import PhotoPicker from '../../components/PhotoPicker.js'
import {
  AppBar, Button, Card, Choice, EmptyState, Field, Loading, Notice,
  TextInput, VoiceInput, useAsync,
} from '../../components/ui.js'
import {
  IconProduct, IconWaiting, VegMark,
} from '../../components/icons.js'

const UNITS: Unit[] = ['kg', 'g', 'piece', 'dozen', 'litre', 'ml', 'set']

/**
 * Editing a product she has already added.
 *
 * Deliberately NOT the upload wizard. One question per screen is right the
 * first time, when the job is teaching her what a listing needs; it is wrong
 * for changing a price, where it would put four taps between her and the one
 * number she came to fix. Everything is on one page, Save is at the bottom.
 *
 * Food or not is fixed once created. It decides which categories apply and
 * which licence the listing carries, so changing it would quietly re-file the
 * product under a licence nobody checked it against - that is a new listing,
 * not an edit.
 */
export default function EditProduct() {
  const { productId } = useParams()
  const t = useT()
  const { lang } = useI18n()
  const nav = useNavigate()
  const { toast } = useToast()

  const [data, loading] = useAsync(() => api.myProducts(), [])
  const [catData] = useAsync(() => api.categories(), [])

  type Form = {
    imageUrl: string
    imagePublicId: string
    name: string
    categoryId: string
    ingredients: string
    vegType: '' | 'veg' | 'nonveg'
    material: string
    price: string
    mrp: string
    unit: Unit
    packSize: string
    piecesPerPack: string
    stock: string
    madeToOrder: boolean
  }

  const [d, setD] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState('')

  const product: Product | undefined = data?.products.find((p) => p.id === productId)

  /* Seed the form once, from the product as it stands on the server. */
  useEffect(() => {
    if (!product || d) return
    setD({
      imageUrl: product.imageUrl ?? '',
      imagePublicId: product.imagePublicId ?? '',
      name: product.name,
      categoryId: product.categoryId,
      ingredients: product.ingredients ?? '',
      vegType: product.vegType ?? '',
      material: product.material ?? '',
      price: String(product.price),
      mrp: product.mrp ? String(product.mrp) : '',
      unit: product.unit,
      packSize: product.packSize ? String(product.packSize) : '',
      piecesPerPack: product.piecesPerPack ? String(product.piecesPerPack) : '',
      stock: String(product.stock),
      madeToOrder: !!product.madeToOrder,
    })
  }, [product, d])

  if (loading) {
    return (
      <>
        <AppBar title={t('common.edit')} backTo="/seller/products" />
        <div className="screen"><Loading /></div>
      </>
    )
  }

  if (!product || !d) {
    return (
      <>
        <AppBar title={t('common.edit')} backTo="/seller/products" />
        <div className="screen">
          <Card><EmptyState icon={IconProduct} title={t('prod.notFound')} /></Card>
        </div>
      </>
    )
  }

  const form = d
  const p = product

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setD((cur) => (cur ? { ...cur, [k]: v } : cur))
    setErrors((e) => ({ ...e, [k]: '' }))
  }

  const categories: Category[] = catData?.categories ?? []
  // `other` carries no `food` flag and so belongs to both halves. Without this
  // a listing already filed under it had no category to sit in on its own edit
  // screen, and the select opened blank.
  const visibleCats = categories.filter((c) => c.food === undefined || c.food === p.isFood)

  /**
   * `submitting` is the "send for checking" press, which is where the server
   * checks a listing is complete. A plain save is held to the same standard
   * for everything that was always asked for - and NOT for the size, which
   * listings published before the question existed do not carry. Blocking a
   * price correction until she fills in a field she has never seen would cost
   * her the one thing this app never gets in the way of.
   */
  function validate(submitting = false): boolean {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = t('common.required')
    if (!form.categoryId) e.categoryId = t('common.required')
    if (!form.price || Number(form.price) <= 0) e.price = t('common.required')
    if (p.isFood) {
      if (!form.ingredients.trim()) e.ingredients = t('common.required')
      if (!form.vegType) e.vegType = t('common.required')
    } else if (!form.material.trim()) {
      e.material = t('common.required')
    }
    if (!form.madeToOrder && form.stock === '') e.stock = t('common.required')
    if (submitting) {
      if (!form.packSize || Number(form.packSize) <= 0) e.packSize = t('common.required')
      if (needsPieceCount(form.unit) && (!form.piecesPerPack || Number(form.piecesPerPack) <= 0)) {
        e.piecesPerPack = t('common.required')
      }
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  /**
   * `submit` is what turns a draft into a listing awaiting review. Saving on
   * its own never moves the status, so she can fix a typo on a draft without
   * it leaving her hands.
   */
  async function save(submit: boolean) {
    if (!validate(submit)) return
    setBusy(true)
    setServerError('')
    try {
      await api.updateProduct(p.id, {
        imageUrl: form.imageUrl || undefined,
        imagePublicId: form.imagePublicId || undefined,
        name: form.name.trim(),
        categoryId: form.categoryId,
        ingredients: p.isFood ? form.ingredients : undefined,
        vegType: p.isFood && form.vegType ? form.vegType : undefined,
        material: p.isFood ? undefined : form.material,
        price: Number(form.price),
        mrp: Number(form.mrp) || 0,
        unit: form.unit,
        packSize: Number(form.packSize) || undefined,
        piecesPerPack: needsPieceCount(form.unit) ? Number(form.piecesPerPack) || undefined : undefined,
        stock: form.madeToOrder ? 0 : Number(form.stock),
        madeToOrder: form.madeToOrder,
        ...(submit ? { status: 'LIVE' as const } : {}),
      })
      toast(t(submit ? 'ok.productPublished' : 'ok.productUpdated'))
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

  const canSubmit = p.status === 'DRAFT' || p.status === 'REJECTED'

  /**
   * Two changes to what the listing IS, then the description is settled.
   *
   * Price and stock are never counted, so the fields she touches weekly stay
   * open for ever - and the ones that would turn this listing into a different
   * product are the ones that run out. `locked` disables those rather than
   * letting her retype a name the server is going to refuse.
   */
  const limited = editsAreLimited(p.status)
  const left = editsLeft(p)
  const locked = limited && left <= 0

  /** Does what is on screen right now spend one? Price-only saves do not. */
  const spends = limited && countsAsEdit(p, {
    name: form.name.trim(),
    categoryId: form.categoryId,
    imageUrl: form.imageUrl || undefined,
    imagePublicId: form.imagePublicId || undefined,
    ingredients: p.isFood ? form.ingredients : undefined,
    vegType: p.isFood && form.vegType ? form.vegType : undefined,
    material: p.isFood ? undefined : form.material,
    unit: form.unit,
    packSize: Number(form.packSize) || undefined,
    piecesPerPack: needsPieceCount(form.unit) ? Number(form.piecesPerPack) || undefined : undefined,
    mrp: Number(form.mrp) || 0,
    madeToOrder: form.madeToOrder,
  })

  return (
    <>
      <AppBar title={p.name} sub={t('common.edit')} backTo="/seller/products" />

      <div className="screen stack">
        {serverError && <Notice tone="danger">{serverError}</Notice>}

        {/* How many changes are left, said before she starts typing rather
            than after she taps Save. The second line is the important one:
            running out does not freeze her prices. */}
        {limited && (
          <Notice tone={locked ? 'danger' : left === 1 ? 'warn' : 'info'}>
            {locked ? t('prod.editsNone') : t('prod.editsLeft', { n: left })}
            {' '}{t('prod.editsPriceFree')}
          </Notice>
        )}

        {/* The one warning that has to arrive before the tap, not after. */}
        {spends && left === 1 && <Notice tone="warn">{t('prod.editsLastWarn')}</Notice>}

        <Field label={t('prod.photos')} hint={t('prod.photosHint')}>
          <PhotoPicker
            locked={locked}
            imageUrl={form.imageUrl || undefined}
            onUploaded={(img) =>
              setD((cur) => (cur ? { ...cur, imageUrl: img.url, imagePublicId: img.publicId } : cur))
            }
            onCleared={() =>
              setD((cur) => (cur ? { ...cur, imageUrl: '', imagePublicId: '' } : cur))
            }
          />
        </Field>

        <Field label={t('prod.name')} error={errors.name} required>
          <VoiceInput
            value={form.name}
            onChange={(v) => set('name', v)}
            error={!!errors.name}
            disabled={locked}
            placeholder={t('prod.namePlaceholder')}
          />
        </Field>

        <Field label={t('prod.category')} error={errors.categoryId} required>
          <div className="wrap-row">
            {visibleCats.map((c) => (
              <button
                key={c.id}
                className={`chip ${form.categoryId === c.id ? 'chip--on' : ''}`}
                disabled={locked}
                onClick={() => set('categoryId', c.id)}
              >
                {lang === 'mr' ? c.mr : c.en}
              </button>
            ))}
          </div>
        </Field>

        {p.isFood ? (
          <>
            <Field
              label={t('prod.ingredients')}
              hint={t('prod.ingredientsHint')}
              error={errors.ingredients}
              required
            >
              <VoiceInput
                value={form.ingredients}
                onChange={(v) => set('ingredients', v)}
                error={!!errors.ingredients}
                disabled={locked}
                multiline
              />
            </Field>

            <Field label={t('prod.vegType')} error={errors.vegType} required>
              <div className="yesno">
                <Choice
                  selected={form.vegType === 'veg'}
                  onSelect={() => set('vegType', 'veg')}
                  icon={<VegMark type="veg" />}
                  title={t('prod.veg')}
                />
                <Choice
                  selected={form.vegType === 'nonveg'}
                  onSelect={() => set('vegType', 'nonveg')}
                  icon={<VegMark type="nonveg" />}
                  title={t('prod.nonveg')}
                />
              </div>
            </Field>
          </>
        ) : (
          <Field
            label={t('prod.material')}
            hint={t('prod.materialHint')}
            error={errors.material}
            required
          >
            <VoiceInput
              value={form.material}
              onChange={(v) => set('material', v)}
              error={!!errors.material}
              disabled={locked}
              multiline
            />
          </Field>
        )}

        <Field label={t('prod.price')} hint={t('prod.priceHint')} error={errors.price} required htmlFor="price">
          <TextInput
            id="price"
            inputMode="numeric"
            value={form.price}
            error={!!errors.price}
            onChange={(e) => set('price', e.target.value.replace(/[^0-9]/g, ''))}
          />
        </Field>

        <Field label={`${t('prod.mrp')} (${t('common.optional')})`} htmlFor="mrp">
          <TextInput
            id="mrp"
            inputMode="numeric"
            value={form.mrp}
            disabled={locked}
            onChange={(e) => set('mrp', e.target.value.replace(/[^0-9]/g, ''))}
          />
        </Field>

        <Field label={t('prod.unit')} required>
          <div className="wrap-row">
            {UNITS.map((u) => (
              <button
                key={u}
                className={`chip ${form.unit === u ? 'chip--on' : ''}`}
                disabled={locked}
                onClick={() => set('unit', u)}
              >
                {t(`unit.${u}`)}
              </button>
            ))}
          </div>
        </Field>

        {/* The size the price is for, beside the unit it counts in. Locked
            with the rest of what the listing IS once her edits run out. */}
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
              value={form.packSize}
              error={!!errors.packSize}
              disabled={locked}
              onChange={(e) => set('packSize', e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="500"
            />
            <strong style={{ flex: 'none' }}>{t(`unit.${form.unit}`)}</strong>
          </div>
        </Field>

        {needsPieceCount(form.unit) && (
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
              value={form.piecesPerPack}
              error={!!errors.piecesPerPack}
              disabled={locked}
              onChange={(e) => set('piecesPerPack', e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="6"
            />
          </Field>
        )}

        <Field label={t('prod.stock')} error={errors.stock} required htmlFor="stock">
          <TextInput
            id="stock"
            inputMode="numeric"
            value={form.stock}
            error={!!errors.stock}
            disabled={form.madeToOrder}
            onChange={(e) => set('stock', e.target.value.replace(/[^0-9]/g, ''))}
          />
        </Field>

        <Choice
          selected={form.madeToOrder}
          onSelect={() => set('madeToOrder', !form.madeToOrder)}
          icon={<IconWaiting />}
          title={t('prod.madeToOrder')}
        />

        <Button onClick={() => void save(false)} disabled={busy}>
          {t('common.save')}
        </Button>

        {canSubmit && (
          <Button variant="ghost" onClick={() => void save(true)} disabled={busy}>
            {t('prod.publish')}
          </Button>
        )}
      </div>
    </>
  )
}
