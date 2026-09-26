import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { cropById } from '@shared/crops.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { useAuth } from '../../store/AuthContext.js'
import { api } from '../../lib/api.js'
import ProductImage from '../../components/ProductImage.js'
import { CultivationPill, PricePerUnit, useHarvestLabel } from '../../components/Produce.js'
import {
  AppBar, Button, Card, EmptyState, LanguagePicker, Loading, useAsync,
} from '../../components/ui.js'
import { IconBuy, IconCall, IconMap, IconProduct, IconWhatsapp } from '../../components/icons.js'

/**
 * WHERE A PRINTED QR LANDS. Public: whoever scanned the sack may have no
 * account and may never make one - the answer to "who grew this, where and
 * when" is theirs either way. A listing no longer on sale is the same
 * "not found" the catalogue gives, so an old sticker says nothing about a
 * farmer who has since been blocked.
 */
export default function Trace() {
  const t = useT()
  const { lang } = useI18n()
  const nav = useNavigate()
  const { session } = useAuth()
  const productId = useParams().productId ?? ''
  const [data, loading] = useAsync(() => api.trace(productId), [productId], `trace:${productId}`)
  const harvested = useHarvestLabel()

  const bar = <AppBar brand title={t('trace.title')} bell={false} />

  if (loading) return <div className="app-shell">{bar}<div className="screen screen--nonav"><Loading /></div></div>
  if (!data) {
    return (
      <div className="app-shell">
        {bar}
        <div className="screen screen--nonav stack">
          <EmptyState icon={IconProduct} title={t('trace.gone')} />
          <LanguagePicker />
        </div>
      </div>
    )
  }

  const { product, farmer } = data
  const crop = cropById(product.cropId)
  const shopPath = `/shop/p/${product.id}`
  const order = () =>
    session?.role === 'customer'
      ? nav(shopPath)
      : nav('/login/customer', { state: { next: shopPath } })

  return (
    <div className="app-shell">
      {bar}
      <div className="screen screen--nonav stack">
        <LanguagePicker />
        <ProductImage src={product.imageUrl} categoryId={product.categoryId} rounded="var(--r)" />
        <h2 className="h2">{product.name}</h2>

        <Card>
          <div className="stack-sm">
            <Row label={t('trace.farmer')}>{farmer.name} · <span className="num">{farmer.farmerCode}</span></Row>
            <Row label={t('trace.village')}>{farmer.village}</Row>
            {crop && <Row label={t('trace.crop')}>{lang === 'mr' ? crop.mr : crop.en}</Row>}
            {product.harvestDate && (
              <Row label={t('trace.harvest')}>
                {new Date(product.harvestDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' · '}{harvested(product.harvestDate)}
              </Row>
            )}
            {product.cultivation && <Row label={t('trace.cultivation')}><CultivationPill cultivation={product.cultivation} /></Row>}
            <Row label={t('trace.price')}><PricePerUnit price={product.price} unit={product.unit} /></Row>
            <Row label={t('trace.available')}>{product.stock} {t(`unit.${product.unit}`)}</Row>
          </div>
        </Card>

        <div className="btn-row">
          <a className="btn btn--ghost" href={`tel:+91${farmer.phone}`}>
            <IconCall aria-hidden="true" /> {t('trace.call')}
          </a>
          <a className="btn btn--ghost" href={`https://wa.me/91${farmer.phone}`} target="_blank" rel="noreferrer">
            <IconWhatsapp aria-hidden="true" /> {t('trace.whatsapp')}
          </a>
        </div>

        {/* ponytail: a plain map link until Task 10's MapView lands, then swap it in. */}
        {farmer.lat != null && farmer.lng != null && (
          <a
            className="btn btn--quiet"
            href={`https://www.openstreetmap.org/?mlat=${farmer.lat}&mlon=${farmer.lng}#map=13/${farmer.lat}/${farmer.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            <IconMap aria-hidden="true" /> {t('trace.map')}
          </a>
        )}

        <Button onClick={order}>
          <IconBuy aria-hidden="true" /> {t('trace.order')}
        </Button>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', gap: 'var(--s3)' }}>
      <span className="small dim">{label}</span>
      <strong style={{ textAlign: 'end' }}>{children}</strong>
    </div>
  )
}
