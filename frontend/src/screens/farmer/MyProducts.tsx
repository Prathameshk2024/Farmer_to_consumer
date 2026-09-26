import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Product } from '@shared/types.js'
import { PRODUCT_STATUS_STYLE, farmerMayDelete } from '@shared/farmer.js'
import { useT } from '../../i18n/I18nProvider.js'
import { api } from '../../lib/api.js'
import { sizeLabel } from '../../lib/productSize.js'
import { useToast } from '../../store/ToastContext.js'
import ProductImage from '../../components/ProductImage.js'
import {
  AppBar, Button, Card, ConfirmSheet, EmptyState, Loading,
  Pill, Rupees, useAsync,
} from '../../components/ui.js'
import {
  IconEdit, IconPause, IconPlay, IconPlus, IconProduct, IconTrash, ProductStatusIcon,
} from '../../components/icons.js'

export default function MyProducts() {
  const t = useT()
  const nav = useNavigate()
  const { toast } = useToast()
  const [data, loading, setData] = useAsync(() => api.myProducts(), [], 'farmer:products')
  const [toDelete, setToDelete] = useState<Product | null>(null)

  if (loading) {
    return <><AppBar title={t('biz.myProducts')} backTo="/farmer" /><div className="screen"><Loading /></div></>
  }
  if (!data) {
    return <><AppBar title={t('biz.myProducts')} backTo="/farmer" /><div className="screen"><EmptyState title="—" /></div></>
  }

  const { products } = data

  async function togglePause(p: Product) {
    const res = await api.updateProduct(p.id, {
      status: p.status === 'PAUSED' ? 'LIVE' : 'PAUSED',
    })
    setData({ ...data!, products: products.map((x) => (x.id === res.product.id ? res.product : x)) })
    toast(t('ok.productUpdated'))
  }

  async function doDelete() {
    if (!toDelete) return
    await api.deleteProduct(toDelete.id)
    setData({ ...data!, products: products.filter((x) => x.id !== toDelete.id) })
    setToDelete(null)
    toast(t('ok.draftRemoved'))
  }

  return (
    <>
      <AppBar title={t('biz.myProducts')} backTo="/farmer" />
      <div className="screen stack">
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
              const style = PRODUCT_STATUS_STYLE[p.status]
              const outOfStock = !p.madeToOrder && p.stock === 0
              return (
                <Card key={p.id}>
                  {/* The whole row is the way in to editing. A farmer who
                      wants to fix a price taps the product, not a pencil the
                      size of a fingernail beside it. */}
                  <button
                    type="button"
                    className="tile-tap"
                    onClick={() => nav(`/farmer/products/${p.id}/edit`)}
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
                        <Pill tone={style.tone} icon={<ProductStatusIcon name={style.icon} />}>{t(style.labelKey)}</Pill>
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
                      onClick={() => nav(`/farmer/products/${p.id}/edit`)}
                    >
                      <IconEdit aria-hidden="true" /> {t('common.edit')}
                    </Button>
                    {/* A sold-out crop is his to take down himself. */}
                    {farmerMayDelete(p.status) && (
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

        <Button onClick={() => nav('/farmer/upload')}>
          <IconPlus aria-hidden="true" /> {t('prod.add')}
        </Button>
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
