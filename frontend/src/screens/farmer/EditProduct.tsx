import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Category, Cultivation, Product, Unit } from '@shared/types.js'
import { categoryFor, listingProblems } from '@shared/produce.js'
import { useT } from '../../i18n/I18nProvider.js'
import { api, ApiError } from '../../lib/api.js'
import { useToast } from '../../store/ToastContext.js'
import PhotoPicker from '../../components/PhotoPicker.js'
import {
  CategoryPicker, CropPicker, CultivationPicker, UnitPicker, todayIso,
} from '../../components/Produce.js'
import {
  AppBar, Button, Card, EmptyState, Field, Loading, Notice,
  TextInput, VoiceInput, useAsync,
} from '../../components/ui.js'
import { IconProduct } from '../../components/icons.js'

/**
 * Editing a listing he has already added.
 *
 * Deliberately NOT the upload wizard. One question per screen is right the
 * first time, when the job is teaching him what a listing needs; it is wrong
 * for changing a price, where it would put eight taps between him and the one
 * number he came to fix. Every field is on one page, Save is at the bottom,
 * and every field may change - there is no edit limit.
 */
export default function EditProduct() {
  const { productId } = useParams()
  const t = useT()
  const nav = useNavigate()
  const { toast } = useToast()

  const [data, loading] = useAsync(() => api.myProducts(), [])
  const [catData] = useAsync(() => api.categories(), [])

  type Form = {
    imageUrl: string
    imagePublicId: string
    cropId: string
    categoryId: string
    name: string
    unit: Unit
    price: string
    stock: string
    minOrder: string
    harvestDate: string
    cultivation: Cultivation | ''
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
      cropId: product.cropId,
      categoryId: product.categoryId,
      name: product.name,
      unit: product.unit,
      price: String(product.price),
      stock: String(product.stock),
      minOrder: String(product.minOrder ?? 1),
      harvestDate: product.harvestDate,
      cultivation: product.cultivation ?? '',
    })
  }, [product, d])

  if (loading) {
    return (
      <>
        <AppBar title={t('common.edit')} backTo="/farmer/products" />
        <div className="screen"><Loading /></div>
      </>
    )
  }

  if (!product || !d) {
    return (
      <>
        <AppBar title={t('common.edit')} backTo="/farmer/products" />
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

  const listing = {
    cropId: form.cropId,
    categoryId: categoryFor(form.cropId, form.categoryId) ?? '',
    name: form.name.trim(),
    unit: form.unit,
    price: Number(form.price),
    stock: form.stock === '' ? NaN : Number(form.stock),
    minOrder: Number(form.minOrder),
    harvestDate: form.harvestDate,
    cultivation: (form.cultivation || undefined) as Cultivation | undefined,
  }

  /**
   * A listing on sale is held to the full rules on every save - the server
   * refuses the same things, so this only says it sooner. A draft saved
   * without `submit` is his to leave half-done.
   */
  function validate(submit: boolean): boolean {
    if (p.status === 'DRAFT' && !submit) return true
    const e = listingProblems(listing)
    if (form.cropId === 'other' && !form.categoryId) e.categoryId = t('common.required')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  /**
   * `submit` is what puts a draft on sale. Saving on its own never moves the
   * status, so he can fix a typo on a draft without it leaving his hands.
   */
  async function save(submit: boolean) {
    if (!validate(submit)) return
    setBusy(true)
    setServerError('')
    try {
      await api.updateProduct(p.id, {
        ...listing,
        stock: Number(form.stock) || 0,
        imageUrl: form.imageUrl || undefined,
        imagePublicId: form.imagePublicId || undefined,
        ...(submit ? { status: 'LIVE' as const } : {}),
      })
      toast(t(submit ? 'ok.productPublished' : 'ok.productUpdated'))
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
  const unitWord = t(`unit.${form.unit}`)

  return (
    <>
      <AppBar title={p.name} sub={t('common.edit')} backTo="/farmer/products" />

      <div className="screen stack">
        {serverError && <Notice tone="danger">{serverError}</Notice>}

        <Field label={t('prod.photos')} hint={t('prod.photosHint')}>
          <PhotoPicker
            imageUrl={form.imageUrl || undefined}
            onUploaded={(img) =>
              setD((cur) => (cur ? { ...cur, imageUrl: img.url, imagePublicId: img.publicId } : cur))
            }
            onCleared={() =>
              setD((cur) => (cur ? { ...cur, imageUrl: '', imagePublicId: '' } : cur))
            }
          />
        </Field>

        <Field label={t('prod.crop')} error={errors.cropId} required>
          <CropPicker value={form.cropId} onPick={(id) => set('cropId', id)} categories={categories} />
        </Field>

        {form.cropId === 'other' && (
          <Field label={t('prod.otherCategory')} error={errors.categoryId} required>
            <CategoryPicker value={form.categoryId} onPick={(id) => set('categoryId', id)} categories={categories} />
          </Field>
        )}

        <Field label={t('prod.name')} error={errors.name} required>
          <VoiceInput
            value={form.name}
            onChange={(v) => set('name', v)}
            error={!!errors.name}
            placeholder={t('prod.namePlaceholder')}
          />
        </Field>

        <Field label={t('prod.unit')} error={errors.unit} required>
          <UnitPicker value={form.unit} onPick={(u) => set('unit', u)} />
        </Field>

        <Field label={t('prod.price')} hint={t('prod.priceHint')} error={errors.price} required htmlFor="price">
          <div className="row" style={{ gap: 'var(--s2)' }}>
            <TextInput id="price" inputMode="numeric" value={form.price} error={!!errors.price} onChange={numeric('price')} />
            <strong style={{ flex: 'none' }}>/ {unitWord}</strong>
          </div>
        </Field>

        <Field label={t('prod.stock')} error={errors.stock} required htmlFor="stock">
          <div className="row" style={{ gap: 'var(--s2)' }}>
            <TextInput id="stock" inputMode="numeric" value={form.stock} error={!!errors.stock} onChange={numeric('stock')} />
            <strong style={{ flex: 'none' }}>{unitWord}</strong>
          </div>
        </Field>

        <Field label={t('prod.minOrder')} hint={t('prod.minOrderHint')} error={errors.minOrder} required htmlFor="minOrder">
          <div className="row" style={{ gap: 'var(--s2)' }}>
            <TextInput id="minOrder" inputMode="numeric" value={form.minOrder} error={!!errors.minOrder} onChange={numeric('minOrder')} />
            <strong style={{ flex: 'none' }}>{unitWord}</strong>
          </div>
        </Field>

        <Field label={t('prod.harvestDate')} error={errors.harvestDate} required htmlFor="harvestDate">
          <TextInput
            id="harvestDate"
            type="date"
            max={todayIso()}
            value={form.harvestDate}
            error={!!errors.harvestDate}
            onChange={(e) => set('harvestDate', e.target.value)}
          />
        </Field>

        <Field label={t('prod.cultivation')} error={errors.cultivation} required>
          <CultivationPicker value={form.cultivation} onPick={(c) => set('cultivation', c)} />
        </Field>

        <Button onClick={() => void save(false)} disabled={busy}>
          {t('common.save')}
        </Button>

        {p.status === 'DRAFT' && (
          <Button variant="ghost" onClick={() => void save(true)} disabled={busy}>
            {t('upl.publish')}
          </Button>
        )}
      </div>
    </>
  )
}
