import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Product } from '@shared/types.js'
import { PRODUCT_STATUS_STYLE, sellerMayDelete } from '@shared/seller.js'
import { useT } from '../../i18n/I18nProvider.js'
import { api } from '../../lib/api.js'
import { sizeLabel } from '../../lib/productSize.js'
import { useToast } from '../../store/ToastContext.js'
import ProductImage from '../../components/ProductImage.js'
import { SubscriptionNotice } from '../../components/SubscriptionNotice.js'
import {
  AppBar, Button, Card, ConfirmSheet, EmptyState, Loading, Notice,
  Pill, Rupees, SlotMeter, useAsync,
} from '../../components/ui.js'
import {
  IconEdit, IconPause, IconPlay, IconPlus, IconProduct, IconTrash, ProductStatusIcon,
} from '../../components/icons.js'

export default function MyProducts() {
  const t = useT()
  const nav = useNavigate()
  const { toast } = useToast()
  const [data, loading, setData] = useAsync(() => api.myProducts(), [], 'seller:products')
  const [toDelete, setToDelete] = useState<Product | null>(null)

  if (loading) {
    return <><AppBar title={t('biz.myProducts')} backTo="/seller" /><div className="screen"><Loading /></div></>
  }
  if (!data) {
    return <><AppBar title={t('biz.myProducts')} backTo="/seller" /><div className="screen"><EmptyState title="—" /></div></>
  }

  const { products, slots } = data
  const expired = data.subscription?.state === 'expired'

  async function togglePause(p: Product) {
    const res = await api.updateProduct(p.id, {
      status: p.status === 'PAUSED' ? 'LIVE' : 'PAUSED',
    })
    setData({ ...data!, products: products.map((x) => (x.id === res.product.id ? res.product : x)) })
    toast(t('ok.productUpdated'))
  }

  async function doDelete() {
    if (!toDelete) return
    const res = await api.deleteDraft(toDelete.id)
    setData({ ...data!, products: products.filter((x) => x.id !== toDelete.id), slots: res.slots })
    setToDelete(null)
    toast(t('ok.draftRemoved'))
  }

  return (
    <>
      <AppBar title={t('biz.myProducts')} backTo="/seller" />
      <div className="screen stack">
        <SubscriptionNotice view={data.subscription} />

        <Card>
          <SlotMeter
            used={slots.used}
            total={slots.total}
            hint={slots.isFull ? t('biz.slotsFull') : t('biz.slotsLeft', { n: slots.left })}
          />
        </Card>

        {products.length === 0 ? (
          <Card>
            {/* No action here: the same button sits in the bar below, on every
                branch of this screen. Two of it, one above the other, made the
                lower one look like a different thing. */}
            <EmptyState
              icon={IconProduct}
              title={t('prod.noProducts')}
              body={t('prod.noProductsSub')}
            />
          </Card>
        ) : (
          <div className="stack-sm">
            {products.map((p) => {
              const style = p.status !== 'ARCHIVED' ? PRODUCT_STATUS_STYLE[p.status] : null
              const outOfStock = !p.madeToOrder && p.stock === 0
              return (
                <Card key={p.id}>
                  {/* The whole row is the way in to editing. A seller who
                      wants to fix a price taps the product, not a pencil the
                      size of a fingernail beside it. */}
                  <button
                    type="button"
                    className="tile-tap"
                    onClick={() => nav(`/seller/products/${p.id}/edit`)}
                  >
                    <ProductImage
                      src={p.imageUrl}
                      categoryId={p.categoryId}
                      size={62}
                      className="tile__img"
                    />
                    <div className="tile__body">
                      <div className="tile__title">{p.name}</div>
                      <div className="row" style={{ gap: 6 }}>
                        <strong><Rupees value={p.price} /></strong>
                        <span className="small dim">/ {sizeLabel(p, t)}</span>
                      </div>
                      <div className="wrap-row" style={{ marginTop: 4 }}>
                        {/* While the shop is paused a LIVE listing is not live
                            to anyone, so it does not say it is. Its own status
                            is untouched - it reads LIVE again on renewal. */}
                        {expired && p.status === 'LIVE' ? (
                          <Pill tone="warn" icon={<ProductStatusIcon name="paused" />}>{t('sub.pausedPill')}</Pill>
                        ) : (
                          style && <Pill tone={style.tone} icon={<ProductStatusIcon name={style.icon} />}>{t(style.labelKey)}</Pill>
                        )}
                        <Pill tone={outOfStock ? 'danger' : 'neutral'}>
                          {outOfStock
                            ? t('prod.outOfStock')
                            : p.madeToOrder
                              ? t('prod.madeToOrder')
                              : `${t('prod.inStock')}: ${p.stock}`}
                        </Pill>
                      </div>
                    </div>
                    <span className="tile-tap__go" aria-hidden="true"><IconEdit /></span>
                  </button>

                  <div className="btn-row" style={{ marginTop: 'var(--s3)' }}>
                    {(p.status === 'LIVE' || p.status === 'PAUSED') && (
                      <Button variant="quiet" size="sm" onClick={() => void togglePause(p)}>
                        {p.status === 'PAUSED' ? <IconPlay aria-hidden="true" /> : <IconPause aria-hidden="true" />}
                      </Button>
                    )}
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => nav(`/seller/products/${p.id}/edit`)}
                    >
                      <IconEdit aria-hidden="true" /> {t('common.edit')}
                    </Button>
                    {/* No Remove on a submitted listing: it keeps its slot
                        until an admin rejects it or takes it down. A draft
                        holds no slot, so that one she can still throw away. */}
                    {sellerMayDelete(p.status) && (
                      <Button variant="ghost" size="sm" onClick={() => setToDelete(p)}>
                        <IconTrash aria-hidden="true" /> {t('prod.deleteDraft')}
                      </Button>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        <Button onClick={() => nav('/seller/upload')} disabled={slots.isFull}>
          <IconPlus aria-hidden="true" /> {t('prod.add')}
        </Button>
        {slots.isFull && (
          <Notice tone="warn" title={t('prod.slotsFullTitle')}>{t('prod.slotsFullBody')}</Notice>
        )}
      </div>

      {/* Spells out the consequence, never a bare "Are you sure?" */}
      <ConfirmSheet
        open={!!toDelete}
        title={toDelete?.name || t('prod.draft')}
        body={t('prod.deleteDraftConfirm')}
        confirmLabel={t('prod.deleteDraft')}
        tone="danger"
        onCancel={() => setToDelete(null)}
        onConfirm={() => void doDelete()}
      />
    </>
  )
}
