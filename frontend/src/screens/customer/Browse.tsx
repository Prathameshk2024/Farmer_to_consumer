import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Category, Product, Farmer } from '@shared/types.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { useCart } from '../../store/CartContext.js'
import { useToast } from '../../store/ToastContext.js'
import ProductImage from '../../components/ProductImage.js'
import { Avatar } from '../../components/Avatar.js'
import { api } from '../../lib/api.js'
import { ReportLink, ReportSheet } from '../../components/ReportSheet.js'
import { categoryPhoto } from '../../lib/categoryPhoto.js'
import {
  AppBar, Button, Card, EmptyState, Loading, Notice, Pill,
  Rupees, SectionTitle, TextInput, useAsync,
} from '../../components/ui.js'
import {
  IconCart, IconCheck, IconMap, IconMinus, IconNext, IconPlus, IconProduct, IconSearch,
} from '../../components/icons.js'
import { PageTour } from '../../components/Walkthrough.js'
import { RatingLine, RatingSummaryCard, ReviewList } from '../../components/Reviews.js'
import { CultivationPill, PricePerUnit, useHarvestLabel } from '../../components/Produce.js'
import { cropById } from '@shared/crops.js'
import { cartStep } from '@shared/produce.js'

/**
 * The picture on a category tile: a photograph where we have one, a plain
 * product icon where we do not. Both are the same height, so a mixed grid still lines up.
 */
function CategoryTileArt({ category }: { category: Category }) {
  const photo = categoryPhoto(category.id)
  if (!photo) {
    return (
      <div className="tileart" aria-hidden="true"><IconProduct /></div>
    )
  }
  return (
    <img
      src={photo}
      alt=""
      loading="lazy"
      decoding="async"
      style={{ width: '100%', height: 72, objectFit: 'cover', borderRadius: 'var(--r-sm)' }}
    />
  )
}

type CardProduct = Product & { farmer?: Partial<Farmer>; rating?: number; ratingCount?: number }

export function ProductCard({ product, onOpen }: { product: CardProduct; onOpen: () => void }) {
  const t = useT()
  const harvested = useHarvestLabel()
  return (
    <div className="pcard">
      {/* The card opens the product; the control below adds it. Two jobs, two
          buttons - a tap on ADD that also navigated away would lose her the
          list she was working down. */}
      <button className="pcard__open" onClick={onOpen}>
        <ProductImage
          src={product.imageUrl}
          categoryId={product.categoryId}
          className="pcard__img"
          rounded="0"
        />
        <div className="pcard__body">
          <div className="pcard__name">{product.name}</div>
          {/* The price is for ONE unit, and says which. */}
          <div className="pcard__price"><PricePerUnit price={product.price} unit={product.unit} /></div>
          <div className="pcard__size">{harvested(product.harvestDate)}</div>
          {product.minOrder > 1 && (
            <div className="pcard__size">{t('prod.minOrderShort', { n: product.minOrder, unit: t(`unit.${product.unit}`) })}</div>
          )}
          <CultivationPill cultivation={product.cultivation} />
          {/* Its own stars, from buyers who received it. Nothing at all on a
              product nobody has rated - "no reviews" down a grid is noise. */}
          <RatingLine average={product.rating} count={product.ratingCount} hideEmpty />
        </div>
      </button>

      <div className="pcard__add">
        <AddControl product={product} />
      </div>
    </div>
  )
}

/**
 * ADD, then how many she has.
 *
 * A count she can see is the difference between "did that work?" and knowing
 * it did - the cart badge is at the bottom of the screen and the product she
 * just tapped is under her thumb. Once there is one in the cart the button
 * becomes the count, with a minus beside it, so a mis-tap is undone where it
 * happened rather than two screens away.
 *
 * Bounded by the farmer's minimum and his stock (`cartStep`): the first tap
 * adds the minimum, and a − below it takes the line out, because the whole
 * listing is a promise he has to keep.
 */
function AddControl({ product }: { product: CardProduct }) {
  const t = useT()
  const { toast } = useToast()
  const { items, add, step, canAdd, farmerName: cartShop } = useCart()

  const qty = items.find((i) => i.productId === product.id)?.qty ?? 0
  // Less on the shelf than his minimum cannot be ordered (cartStep).
  const outOfStock = cartStep(product, 0, 1) === 0

  if (outOfStock) {
    return <span className="pill pill--danger">{t('prod.outOfStock')}</span>
  }

  if (qty === 0) {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          // One farmer owns the cart. A toast rather than a dialog: she is in
          // the middle of a list, and the product screen says it in full.
          if (!add(product, undefined, product.farmer?.shopName) && !canAdd(product.farmerId)) {
            toast(t('cus.cartLocked', { shop: cartShop ?? '' }), 'warn')
          }
        }}
      >
        {t('cus.addToCart')} +
      </Button>
    )
  }

  return (
    <div className="qtybar">
      <button
        className="qtybar__btn"
        aria-label={qty > Math.max(1, product.minOrder) ? t('cart.decrease') : t('cart.removeItem')}
        onClick={() => step(product.id, product.stock, -1)}
      >
        <IconMinus aria-hidden="true" />
      </button>
      <span className="qtybar__n num" aria-live="polite">{qty}</span>
      <button
        className="qtybar__btn"
        aria-label={t('cart.increase')}
        disabled={qty >= product.stock}
        onClick={() => step(product.id, product.stock, 1)}
      >
        <IconPlus aria-hidden="true" />
      </button>
    </div>
  )
}

export function Explore() {
  const t = useT()
  const nav = useNavigate()
  const [q, setQ] = useState('')

  // Deliberately NOT filtered by pincode. Browsing is for discovery, and a
  // pincode filter here hid whole shops behind a setting most shoppers never
  // touched. Serviceability is checked where it actually matters - at
  // checkout, and per farmer, where it can be explained rather than silently
  // shortening the list.
  const [data, loading] = useAsync(() => api.catalog(), [], 'catalog')

  const products = data?.products ?? []
  const list = products.filter((p) =>
    !q.trim() ? true : [p.name, cropById(p.cropId)?.mr, cropById(p.cropId)?.en].join(' ').toLowerCase().includes(q.toLowerCase()),
  )

  return (
    <>
      <AppBar
        brand title={t('app.name')} sub={t('app.nameShort')}
        right={
          <button type="button" className="appbar__btn appbar__btn--word" onClick={() => nav('/shop/map')}>
            <IconMap aria-hidden="true" /><span>{t('map.title')}</span>
          </button>
        }
      />
      <div className="screen stack">
        <TextInput
          data-wt="ex-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('cus.searchPlaceholder')}
          aria-label={t('common.search')}
        />

        {/* The category strip lived here and is gone: it duplicated the
            Categories tab a thumb's width below it, and cost the products the
            top half of the screen to do it. */}

        <div data-wt="ex-grid">
          {/* Only search results get a heading. The default grid is the whole
              point of the screen, so a label above it named the obvious and
              pushed the first row of products further down the phone. */}
          {q && <SectionTitle>{t('common.search')}</SectionTitle>}
          {loading ? (
            <Loading />
          ) : list.length === 0 ? (
            <EmptyState icon={IconSearch} title={t('prod.noProducts')} />
          ) : (
            <div className="pgrid">
              {list.map((p) => (
                <ProductCard key={p.id} product={p} onOpen={() => nav(`/shop/p/${p.id}`)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <PageTour id="shop.explore" />
    </>
  )
}

export function Categories() {
  const t = useT()
  const nav = useNavigate()
  const { lang } = useI18n()
  const [data, loading] = useAsync(() => api.categories(), [], 'categories')

  return (
    <>
      <AppBar brand title={t('nav.categories')} />
      <div className="screen" data-wt="cat-grid">
        {loading ? (
          <Loading />
        ) : (
          <div className="pgrid">
            {(data?.categories ?? []).map((c) => (
              <button
                key={c.id}
                className="card card--tap"
                style={{ textAlign: 'center' }}
                onClick={() => nav(`/shop/c/${c.id}`)}
              >
                <CategoryTileArt category={c} />
                <div style={{ fontWeight: 700, marginTop: 6 }}>{lang === 'mr' ? c.mr : c.en}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <PageTour id="shop.categories" />
    </>
  )
}

export function CategoryProducts() {
  const { categoryId } = useParams()
  const t = useT()
  const nav = useNavigate()
  const { lang } = useI18n()

  const [data, loading] = useAsync(() => api.catalog({ categoryId }), [categoryId], `catalog:c:${categoryId}`)
  const [catData] = useAsync(() => api.categories(), [], 'categories')
  const cat = (catData?.categories ?? []).find((c) => c.id === categoryId)
  const products = data?.products ?? []

  return (
    <>
      <AppBar
        title={cat ? (lang === 'mr' ? cat.mr : cat.en) : t('nav.categories')}
        backTo="/shop/categories"
      />
      <div className="screen">
        {loading ? (
          <Loading />
        ) : products.length === 0 ? (
          <EmptyState icon={IconProduct} title={t('prod.noProducts')} />
        ) : (
          <div className="pgrid">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} onOpen={() => nav(`/shop/p/${p.id}`)} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export function ProductDetail() {
  const { productId } = useParams()
  const t = useT()
  const nav = useNavigate()
  const { add, has, canAdd, farmerName: cartShop } = useCart()
  const harvested = useHarvestLabel()

  const [data, loading] = useAsync(() => api.product(productId!), [productId], `product:${productId}`)
  /** Open while she is saying what is wrong with this listing. */
  const [reporting, setReporting] = useState(false)

  /**
   * The rest of this shop's window. Fetched by farmer rather than filtered
   * out of the whole catalogue, so three products cost three products.
   */
  const farmerId = data?.product.farmerId
  const [more] = useAsync(
    () => (farmerId ? api.catalog({ farmerId }) : Promise.resolve({ products: [] })),
    [farmerId],
  )
  const [feedback] = useAsync(() => api.productReviews(productId!), [productId])

  if (loading) {
    return <><AppBar title="" onBack={() => nav(-1)} /><div className="screen"><Loading /></div></>
  }
  if (!data) {
    return <><AppBar title="" onBack={() => nav(-1)} /><div className="screen"><EmptyState title="—" /></div></>
  }

  const { product, farmer } = data
  // Less on the shelf than his minimum cannot be ordered (cartStep).
  const outOfStock = cartStep(product, 0, 1) === 0

  // Newest first, this one excluded, three of them. Three is a glance; a
  // second grid of everything she sells belongs on the shop page, not under
  // the buy button.
  const alsoFromShop = (more?.products ?? [])
    .filter((p) => p.id !== product.id)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, 3)

  /**
   * ONE FARMER AT A TIME. The cart belongs to whoever she added from first,
   * so this product is refused while another shop holds it - with the name of
   * that shop and a way to go and look, never by emptying it for her.
   */
  const blockedBy = canAdd(product.farmerId) ? null : (cartShop ?? '')

  return (
    <>
      <AppBar title={product.name} onBack={() => nav(-1)} />
      <div className="screen stack">
        <div style={{ maxWidth: 420, margin: '0 auto', width: '100%' }}>
          <ProductImage
            src={product.imageUrl}
              categoryId={product.categoryId}
            rounded="var(--r-lg)"
          />
        </div>

        <div className="stack-sm">
          <h1 className="h2">{product.name}</h1>
          <PricePerUnit price={product.price} unit={product.unit} big />
          <div className="wrap-row">
            <CultivationPill cultivation={product.cultivation} />
            <Pill tone={outOfStock ? 'danger' : 'ok'}>
              {outOfStock ? t('prod.outOfStock') : t('prod.inStock')}
            </Pill>
          </div>
          <div className="small dim">{harvested(product.harvestDate)}</div>
          {/* Said before the button, because the first tap adds this many. */}
          {product.minOrder > 1 && (
            <div className="small">{t('prod.minOrderShort', { n: product.minOrder, unit: t(`unit.${product.unit}`) })}</div>
          )}
        </div>

        {farmer && <FarmerCard farmer={farmer} />}

        {product.description && (
          <Card><div className="small">{product.description}</div></Card>
        )}

        {farmer && (
          <Notice tone="info">
            {/* ₹0 read as "free"; nobody set it (see CartContext). */}
            {t('cus.deliveryFee')}: {farmer.deliveryFee > 0 ? <Rupees value={farmer.deliveryFee} /> : t('cart.deliveryAsk')}
            {farmer.freeDeliveryAbove > 0 && <> · <Rupees value={farmer.freeDeliveryAbove} />+ {t('cart.free')}</>}
          </Notice>
        )}

        {/* What buyers who received THIS product said about it, before the
            buy button - the one thing about a village product a stranger
            cannot check for themselves. Products are rated, farmers are not. */}
        {feedback && (
          <div>
            <SectionTitle>{t('rev.title')}</SectionTitle>
            <div className="stack-sm">
              <RatingSummaryCard summary={feedback.summary} />
              {feedback.reviews.length > 0 && <ReviewList reviews={feedback.reviews} />}
            </div>
          </div>
        )}

        {/* Anyone looking at a listing can say it should not be here: a
            photo that is not hers, food that looks unsafe, a price that is a
            trick. Quiet, at the foot of what it reports, and never beside
            the button that adds it to a basket. Google Play asks any app
            carrying what its users write to offer exactly this. */}
        <div className="center" style={{ paddingTop: 'var(--s3)' }}>
          <ReportLink onClick={() => setReporting(true)} />
        </div>
        <ReportSheet
          targetType="product"
          targetId={product.id}
          title={product.name}
          open={reporting}
          onClose={() => setReporting(false)}
        />

        {/* Three, then the door to the rest. One shop owns the cart now, so
            what else that shop sells is the most useful thing on this screen:
            the next item she buys can only come from here. */}
        {alsoFromShop.length > 0 && (
          <div>
            <SectionTitle>{t('cus.moreFromShop')}</SectionTitle>
            <div className="pgrid">
              {alsoFromShop.map((p) => (
                <ProductCard key={p.id} product={p} onOpen={() => nav(`/shop/p/${p.id}`)} />
              ))}
            </div>
            <Button
              variant="ghost"
              onClick={() => nav(`/shop/farmer/${product.farmerId}`)}
              style={{ marginTop: 'var(--s3)' }}
            >
              {t('cus.seeAllFromShop')} <IconNext aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      <div className="actionbar">
        {blockedBy !== null ? (
          <>
            {/* Her cart is not touched. She is told whose it is and sent to
                look at it - emptying it for her would lose the only record of
                what she had chosen. */}
            <Notice tone="warn">{t('cus.cartLocked', { shop: blockedBy })}</Notice>
            <Button onClick={() => nav('/shop/cart')}>
              <IconCart aria-hidden="true" /> {t('cus.openCart')}
            </Button>
          </>
        ) : (
          <>
            {/* No quantity row here. It carried `prod.stock` - "how much is
                left?", the question the FARMER answers when he lists the
                product - which asked a buyer to declare the shop's stock. His
                minimum is added, and the quantity is hers to change on the cart line
                that follows, where the ceiling is the stock she cannot see. */}
            <Button
              disabled={outOfStock}
              onClick={() => {
                if (add(product, undefined, farmer?.shopName)) nav('/shop/cart')
              }}
            >
              {outOfStock ? t('prod.outOfStock') : <><IconCart aria-hidden="true" /> {t('cus.addToCart')}</>}
              {has(product.id) && <IconCheck aria-hidden="true" />}
            </Button>
          </>
        )}
      </div>
    </>
  )
}

/**
 * ONE SHOP'S WINDOW.
 *
 * Reached from "see all" under a product, and the natural landing place for
 * her QR poster the day that comes back. It matters more than it used to: the
 * cart holds one farmer at a time, so once a buyer has added anything, this
 * page is the whole of what she can still buy today.
 */
export function FarmerShop() {
  const { farmerId } = useParams()
  const t = useT()
  const nav = useNavigate()

  const [data, loading] = useAsync(() => api.catalog({ farmerId }), [farmerId], `catalog:s:${farmerId}`)
  const products = data?.products ?? []
  const farmer = products[0]?.farmer

  if (loading) {
    return <><AppBar title="" onBack={() => nav(-1)} /><div className="screen"><Loading /></div></>
  }

  return (
    <>
      <AppBar title={farmer?.shopName ?? t('cus.shop')} onBack={() => nav(-1)} />
      <div className="screen stack">
        {farmer && <FarmerCard farmer={farmer} />}

        {farmer && (
          <Notice tone="info">
            {t('cus.deliveryFee')}: {(farmer.deliveryFee ?? 0) > 0 ? <Rupees value={farmer.deliveryFee ?? 0} /> : t('cart.deliveryAsk')}
            {(farmer.freeDeliveryAbove ?? 0) > 0 && (
              <> · <Rupees value={farmer.freeDeliveryAbove ?? 0} />+ {t('cart.free')}</>
            )}
            {(farmer.minOrder ?? 0) > 0 && <> · {t('cart.minOrder')} <Rupees value={farmer.minOrder ?? 0} /></>}
          </Notice>
        )}

        {/* An empty shop is not an error. A farmer between batches has taken
            her listings down, and saying so beats an error icon. */}
        {products.length === 0 ? (
          <Card><EmptyState icon={IconProduct} title={t('prod.noProducts')} /></Card>
        ) : (
          <>
            <SectionTitle>{t('cus.allFromShop')} ({products.length})</SectionTitle>
            <div className="pgrid">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} onOpen={() => nav(`/shop/p/${p.id}`)} />
              ))}
            </div>
          </>
        )}

      </div>
    </>
  )
}

/**
 * Who made this. Not a link any more - the public storefront it opened was
 * the landing page for the share QR, and that whole surface is gone. Her name,
 * her village and her farmer code still belong on the product, because they are
 * what a buyer is choosing between.
 */
function FarmerCard({ farmer }: { farmer: Partial<Farmer> }) {
  const t = useT()
  return (
    <div className="tile">
      <Avatar name={farmer.name} size={62} />
      <div className="tile__body">
        <div className="tile__meta">{t('cus.soldBy')}</div>
        <div className="tile__title">{farmer.shopName}</div>
        {/* Her rating is what buyers gave her products, all of them together. */}
        <div className="tile__meta">
          <RatingLine average={farmer.rating} count={farmer.ratingCount} />
          {!!farmer.ratingCount && <span className="dim"> · {t('rev.fromProducts')}</span>}
        </div>
        <div className="tile__meta">{farmer.village}</div>
        <div className="tiny num dim">{farmer.farmerCode}</div>
      </div>
    </div>
  )
}
