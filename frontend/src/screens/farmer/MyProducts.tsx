import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Product } from '@shared/types.js'
import { PRODUCT_STATUS_STYLE, farmerMayDelete } from '@shared/farmer.js'
import { useT } from '../../i18n/I18nProvider.js'
import { api } from '../../lib/api.js'
import { useToast } from '../../store/ToastContext.js'
import ProductImage from '../../components/ProductImage.js'
import { PricePerUnit, useHarvestLabel } from '../../components/Produce.js'
import { ProductQr } from '../../components/ProductQr.js'
import { SubscriptionNotice } from '../../components/SubscriptionNotice.js'
import {
  AppBar, Button, Card, ConfirmSheet, EmptyState, Loading, Notice,
  Pill, SlotMeter, useAsync,
} from '../../components/ui.js'
import {
  IconClose, IconEdit, IconPause, IconPlay, IconPlus, IconProduct, IconQr, IconTrash, ProductStatusIcon,
} from '../../components/icons.js'

export default function MyProducts() {
  const t = useT()
  const nav = useNavigate()
  const { toast } = useToast()
  const [data, loading, setData] = useAsync(() => api.myProducts(), [], 'farmer:products')
  const [toDelete, setToDelete] = useState<Product | null>(null)
  const [qrFor, setQrFor] = useState<Product | null>(null)
  // The name and code printed under the QR, so a sack found in a market
  // still says whose it is to someone with no phone to scan it.
  const [me] = useAsync(() => api.me(), [])
  const harvested = useHarvestLabel()

  if (loading) {
    return <><AppBar title={t('biz.myProducts')} backTo="/farmer" /><div className="screen"><Loading /></div></>
  }
  if (!data) {
    return <><AppBar title={t('biz.myProducts')} backTo="/farmer" /><div className="screen"><EmptyState title="—" /></div></>
  }

  const { products, slots } = data
  const expired = data.subscription.state === 'expired'

  async function togglePause(p: Product) {
    const res = await api.updateProduct(p.id, {
      status: p.status === 'PAUSED' ? 'LIVE' : 'PAUSED',
    })
    setData({ ...data!, products: products.map((x) => (x.id === res.product.id ? res.product : x)) })
    toast(t('ok.productUpdated'))
  }

  async function doDelete() {
    if (!toDelete) return
    const res = await api.deleteProduct(toDelete.id)
    setData({ ...data!, products: products.filter((x) => x.id !== toDelete.id), slots: res.slots })
    setToDelete(null)
    toast(t('ok.draftRemoved'))
  }

  return (
    <>
      <AppBar title={t('biz.myProducts')} backTo="/farmer" />
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
              const style = PRODUCT_STATUS_STYLE[p.status]
              const outOfStock = p.stock === 0
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
                      <PricePerUnit price={p.price} unit={p.unit} />
                      <div className="small dim">{harvested(p.harvestDate)}</div>
                      <div className="wrap-row" style={{ marginTop: 4 }}>
                        {/* While the shop is paused a LIVE listing is not live
                            to anyone, so it does not say it is. Its own status
                            is untouched - it reads LIVE again on renewal. */}
                        {expired && p.status === 'LIVE' ? (
                          <Pill tone="warn" icon={<ProductStatusIcon name="paused" />}>{t('sub.pausedPill')}</Pill>
                        ) : (
                          <Pill tone={style.tone} icon={<ProductStatusIcon name={style.icon} />}>{t(style.labelKey)}</Pill>
                        )}
                        <Pill tone={outOfStock ? 'danger' : 'neutral'}>
                          {outOfStock
                            ? t('prod.outOfStock')
                            : `${t('prod.inStock')}: ${p.stock} ${t(`unit.${p.unit}`)}`}
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
                    {p.status === 'LIVE' && me && (
                      <Button variant="quiet" size="sm" onClick={() => setQrFor(p)}>
                        <IconQr aria-hidden="true" /> {t('qr.show')}
                      </Button>
                    )}
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => nav(`/farmer/products/${p.id}/edit`)}
                    >
                      <IconEdit aria-hidden="true" /> {t('common.edit')}
                    </Button>
                    {/* A sold-out crop is theirs to take down themselves. */}
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

        {/* Enabled even when full: drafts hold no slot and are always free. */}
        <Button onClick={() => nav('/farmer/upload')}>
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

      {qrFor && me && (
        <QrDialog onClose={() => setQrFor(null)}>
          <ProductQr product={qrFor} farmerName={me.farmer.name} farmerCode={me.farmer.farmerCode} />
        </QrDialog>
      )}
    </>
  )
}

/**
 * Opened with showModal() so it sits above the list wherever the row was.
 * Never closed in an effect cleanup: under StrictMode that `close` event lands
 * after the second showModal() and unmounts the dialog it just opened.
 * Unmounting takes it out of the top layer.
 */
function QrDialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const t = useT()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])
  return (
    <dialog ref={ref} className="sheet qr-dialog" onClose={onClose}>
      <div className="stack">
        <div className="row no-print">
          <h2 className="h2 grow">{t('qr.title')}</h2>
          <button type="button" className="appbar__btn" aria-label={t('qr.close')} onClick={onClose}>
            <IconClose aria-hidden="true" />
          </button>
        </div>
        <p className="body muted no-print">{t('qr.hint')}</p>
        {children}
      </div>
    </dialog>
  )
}
