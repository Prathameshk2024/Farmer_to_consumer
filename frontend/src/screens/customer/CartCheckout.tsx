import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Address, Seller } from '@shared/types.js'
import { OrderRatings } from '../../components/Reviews.js'
import { OrderStatusBox } from '../../components/OrderTracker.js'
import {
  STATUS_STYLE, awaitingCustomerPayment, statusLabelKey,
} from '@shared/orderFlow.js'
import { buildUpiLink, isMaharashtraPincode } from '@shared/seller.js'
import { isValidUtr, normalizeUtr, utrProblem } from '@shared/payment.js'
import { useT } from '../../i18n/I18nProvider.js'
import { useAuth } from '../../store/AuthContext.js'
import { useCart } from '../../store/CartContext.js'
import { usePincode } from '../../store/PincodeContext.js'
import { api, ApiError } from '../../lib/api.js'
import { useToast } from '../../store/ToastContext.js'
import QrCode from '../../components/QrCode.js'
import { PaySteps } from '../../components/PayFromPhone.js'
import { useReturnFromApp } from '../../lib/useReturnFromApp.js'
import { customerCanCancel, sellerCanCancel } from '@shared/orderCancel.js'
import { CancelOrderSheet, OrderEndedNotice, RefundNotice } from '../../components/OrderCancel.js'
import { Avatar } from '../../components/Avatar.js'
import { AddressForm } from '../../components/AddressForm.js'
import { CloseAccountSheet } from '../../components/CloseAccount.js'
import {
  AppBar, Button, Card, Choice, ConfirmSheet, CopyValue, EmptyState, Field, LanguagePicker, Loading,
  Notice, Pill, Rupees, SectionTitle, Stepper, TextInput, VoiceInput, useAsync,
} from '../../components/ui.js'
import { ProductCard } from './Browse.js'
import {
  IconAddressHome, IconAddressOther, IconAllClear, IconCall, IconCart, IconCash, IconChevron, IconNext, IconOrders, IconPlus, IconProduct, IconProfile, IconUpi, IconWhatsapp, StatusIcon,
} from '../../components/icons.js'
import { PageTour, TourMenu } from '../../components/Walkthrough.js'

/**
 * "ASK THE SELLER" WITH SOMETHING TO ASK WITH.
 *
 * Delivery is a hint rather than a price for most sellers here - she writes
 * one pincode at registration and works the rest out per order - so the cart
 * says what delivery costs is hers to tell, and until now a buyer had no way
 * to ask without first placing the order.
 *
 * Her number is not in the catalogue and must not be: `publicSeller` is an
 * allow-list and her phone is deliberately outside it. So the button fetches
 * it when a buyer actually taps, which is a buyer asking one seller a
 * question rather than a directory of village women's phone numbers attached
 * to their names. Once it is here, Call and WhatsApp replace the button.
 */
function AskSellerButton({ sellerId }: { sellerId: string }) {
  const t = useT()
  const [contact, setContact] = useState<{ phone: string; whatsapp: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (contact) {
    return (
      <div className="stack-sm" style={{ marginTop: 'var(--s2)' }}>
        <div className="num">+91 {contact.phone}</div>
        <div className="btn-row">
          <a className="btn btn--ghost btn--sm" href={`tel:+91${contact.phone}`}>
            <IconCall aria-hidden="true" /> {t('cart.callSeller')}
          </a>
          <a
            className="btn btn--ghost btn--sm"
            href={`https://wa.me/91${contact.whatsapp}`}
            target="_blank"
            rel="noreferrer"
          >
            <IconWhatsapp aria-hidden="true" /> {t('cart.whatsappSeller')}
          </a>
        </div>
      </div>
    )
  }

  async function ask() {
    setBusy(true)
    setErr('')
    try {
      setContact(await api.sellerContact(sellerId))
    } catch (e) {
      setErr(e instanceof ApiError ? (e.messageMr ?? e.message) : t('cart.contactFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 'var(--s2)' }}>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void ask()}>
        <IconCall aria-hidden="true" /> {t('cart.contactSeller')}
      </Button>
      {err && <div className="field__err" style={{ marginTop: 4 }}>{err}</div>}
    </div>
  )
}

/**
 * Cart - grouped by seller, because each seller becomes a separate order with
 * its own delivery charge AND its own payment.
 */
export function Cart() {
  const t = useT()
  const nav = useNavigate()
  const { items: cartItems, setQty, count, groupBySeller, sellerId: cartSellerId } = useCart()

  // Sellers come from the catalog, which already carries a seller card per item.
  const [data, loading] = useAsync(() => api.catalog(), [], 'catalog')

  if (loading) return <><AppBar brand title={t('nav.cart')} /><div className="screen"><Loading /></div></>

  if (count === 0) {
    return (
      <>
        <AppBar brand title={t('nav.cart')} />
        <div className="screen">
          <Card>
            <EmptyState
              icon={IconCart}
              title={t('cus.cartEmpty')}
              body={t('cus.cartEmptySub')}
              action={
                <Button data-wt="cart-empty" onClick={() => nav('/shop')}>
                  {t('cus.startShopping')}
                </Button>
              }
            />
          </Card>
        </div>

        {/* The tour belongs on this branch too: an empty basket is where a
            first-time shopper needs telling that products come first. */}
        <PageTour id="shop.cart" />
      </>
    )
  }

  /**
   * How many of this she may still add.
   *
   * Read from the catalogue rather than from the cart line, because the cart
   * is written to localStorage and a jar that was in stock on Tuesday may not
   * be on Friday. Made-to-order has no shelf to count, so it gets the same
   * ceiling the product screen uses; a product that has vanished from the
   * catalogue keeps whatever is already in the basket and goes no higher.
   */
  const maxQty = (productId: string): number => {
    const p = (data?.products ?? []).find((x) => x.id === productId)
    if (!p) return cartItems.find((i) => i.productId === productId)?.qty ?? 1
    return p.madeToOrder ? 20 : p.stock
  }

  const sellers = dedupeSellers(data?.products ?? [])
  const groups = groupBySeller(sellers)
  const grand = groups.reduce((n, g) => n + g.total, 0)

  /**
   * The rest of this shop's window, on the cart itself.
   *
   * The cart is locked to one seller, so this is the entire set of things she
   * can still add to this order - and the catalogue is already loaded for the
   * seller cards above, so it costs nothing to ask. What is already in the
   * cart is left out: it is listed in full a few lines up, with its own
   * controls.
   */
  const inCart = new Set(cartItems.map((i) => i.productId))
  const alsoFromShop = (data?.products ?? []).filter(
    (p) => p.sellerId === cartSellerId && !inCart.has(p.id),
  )
  const blocked = groups.some((g) => g.belowMinimum)

  return (
    <>
      <AppBar brand title={t('nav.cart')} sub={`${count} ${t('ord.items')}`} />
      <div className="screen stack" data-wt="cart-list">
        {/* One seller owns the cart now, so this fires only for a cart saved
            in localStorage before that rule existed. It stays because the
            alternative is dropping her items to make the screen tidy. */}
        {groups.length > 1 && <Notice tone="info">{t('cus.perSellerNote')}</Notice>}

        {groups.map((g) => (
          <Card key={g.sellerId}>
            <div className="row" style={{ marginBottom: 'var(--s3)' }}>
              <Avatar name={g.seller?.shopName ?? g.seller?.name} size={40} />
              <div className="grow">
                <div className="small dim">{t('cus.fromSeller')}</div>
                <strong>{g.seller?.shopName}</strong>
              </div>
            </div>

            {/*
              Both directions, on the line itself.

              It was down-only, on the grounds that quantity belongs on the
              product screen where the stock is - which left a buyer who
              wanted a third jar tapping back into the catalogue to find the
              product again. The stock is the real constraint, so it comes to
              the cart instead: `max` is read from the catalogue this screen
              has already loaded, and the + stops where the shelf does.
            */}
            <div className="stack-sm">
              {g.items.map((i) => (
                /*
                  Two rows, not one. Name, line total and a 132px stepper do
                  not fit across a 360px phone: the total split ("₹1,35" over
                  "0"), and holding the total whole squeezed a long name to a
                  few letters a line. The stepper takes its own row, under the
                  figure it changes.
                */
                <div key={i.productId} className="stack-sm">
                  <div className="row-between" style={{ alignItems: 'flex-start' }}>
                    <div className="row grow">
                      <span className="lineicon" aria-hidden="true"><IconProduct /></span>
                      <div className="grow">
                        <div style={{ fontWeight: 600 }}>{i.name}</div>
                        <div className="small dim">
                          <span className="num">{i.qty}</span> {t(`unit.${i.unit}`)}
                          {' × '}<Rupees value={i.price} />
                        </div>
                      </div>
                    </div>
                    <strong className="num" style={{ flex: 'none' }}><Rupees value={i.price * i.qty} /></strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {/* min 0: the last tap on a line of one takes it out,
                        which is how she empties a cart to reach another shop. */}
                    <Stepper
                      value={i.qty}
                      onChange={(v) => setQty(i.productId, v)}
                      min={0}
                      max={maxQty(i.productId)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <hr className="divider" />

            <div className="stack-sm small">
              <div className="row-between">
                <span className="dim">{t('cus.itemTotal')}</span>
                <Rupees value={g.itemsTotal} />
              </div>
              <div className="row-between">
                <span className="dim">{t('cus.deliveryFee')}</span>
                {g.deliveryToAsk
                  ? <strong>{t('cart.deliveryAsk')}</strong>
                  : g.deliveryFee === 0
                    ? <span className="pill pill--ok">{t('cart.free')}</span>
                    : <Rupees value={g.deliveryFee} />}
              </div>
              {g.deliveryToAsk && (
                <>
                  <div className="dim">{t('cart.deliveryAskHint')}</div>
                  {/* The question the line above raises, with the means to ask
                      it. Her number is fetched on the tap rather than carried
                      in the catalogue - see the route in catalog.routes.ts. */}
                  <AskSellerButton sellerId={g.sellerId} />
                </>
              )}
              <div className="row-between" style={{ fontSize: 'var(--t-base)' }}>
                <strong>{t(g.deliveryToAsk ? 'cus.grandTotalNoDelivery' : 'cus.grandTotal')}</strong>
                <strong><Rupees value={g.total} /></strong>
              </div>
            </div>

            {g.belowMinimum && (
              <div style={{ marginTop: 'var(--s3)' }}>
                <Notice tone="warn">{t('cart.minOrder')} <Rupees value={g.minOrder} /></Notice>
              </div>
            )}
          </Card>
        ))}

        {/* Adding one more thing should not mean going back and finding the
            shop again. Same card as everywhere else, so ADD, the count and
            the stock ceiling behave exactly as they do on Explore. */}
        {alsoFromShop.length > 0 && (
          <div>
            <SectionTitle>{t('cus.moreFromShop')}</SectionTitle>
            <div className="pgrid">
              {alsoFromShop.map((p) => (
                <ProductCard key={p.id} product={p} onOpen={() => nav(`/shop/p/${p.id}`)} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="actionbar" data-wt="cart-total">
        <div className="row-between">
          <strong>{t(groups.some((g) => g.deliveryToAsk) ? 'cus.grandTotalNoDelivery' : 'cus.grandTotal')}</strong>
          <strong style={{ fontSize: 'var(--t-lg)' }}><Rupees value={grand} /></strong>
        </div>
        <Button data-wt="cart-checkout" disabled={blocked} onClick={() => nav('/shop/checkout')}>
          {t('cus.checkout')} <IconNext aria-hidden="true" />
        </Button>
      </div>

      <PageTour id="shop.cart" />
    </>
  )
}

function dedupeSellers(products: { seller?: Partial<Seller> }[]): Partial<Seller>[] {
  const map = new Map<string, Partial<Seller>>()
  for (const p of products) if (p.seller?.id) map.set(p.seller.id, p.seller)
  return [...map.values()]
}

/**
 * One line of address text. `city` is optional now: an address recovered from
 * an order has a line, a landmark and a pincode, but orders never captured a
 * city, so joining it in unguarded printed "..., undefined - 413601".
 */
function addressLine(a: Address): string {
  return [a.line, a.city].filter(Boolean).join(', ') + ` - ${a.pincode}`
}

/* ================================================================== */
/* Checkout - address, then a payment step PER SELLER                   */
/* ================================================================== */

export function Checkout() {
  const t = useT()
  const nav = useNavigate()
  const { session } = useAuth()
  const { toast } = useToast()
  const { groupBySeller, clear } = useCart()

  const [catalogData, loadingCatalog] = useAsync(() => api.catalog(), [])
  const [customerData, loadingCustomer, setCustomerData] = useAsync(() => api.customerMe(), [])

  const { pincode: savedPincode } = usePincode()
  const [addressId, setAddressId] = useState<string | null>(null)
  const [addingAddress, setAddingAddress] = useState(false)
  const [savingAddress, setSavingAddress] = useState(false)
  const [mode, setMode] = useState<'COD' | 'UPI'>('COD')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (loadingCatalog || loadingCustomer) {
    return <><AppBar title={t('cus.checkout')} backTo="/shop/cart" /><div className="screen"><Loading /></div></>
  }

  const customer = customerData?.customer
  const addresses: Address[] = customer?.addresses ?? []

  /** Save a newly typed address, then select it so the customer can carry straight on. */
  async function saveAddress(input: Parameters<typeof api.addAddress>[0]) {
    setSavingAddress(true)
    setErr('')
    try {
      const res = await api.addAddress(input)
      setAddressId(res.address.id)
      setAddingAddress(false)
      setCustomerData(await api.customerMe())
      toast(t('ok.addressSaved'))
    } catch (e) {
      setErr(e instanceof ApiError ? (e.messageMr ?? e.message) : 'Network error')
    } finally {
      setSavingAddress(false)
    }
  }
  const sellers = dedupeSellers(catalogData?.products ?? [])
  const groups = groupBySeller(sellers)
  const address =
    addresses.find((a) => a.id === addressId) ??
    // The customer already gave a pincode on Explore - default to the address
    // that matches it rather than asking for the same thing twice.
    addresses.find((a) => a.pincode === savedPincode) ??
    addresses.find((a) => a.isDefault) ??
    addresses[0]
  const grand = groups.reduce((n, g) => n + g.total, 0)

  /**
   * Not in the customer's listed areas is a WARNING now, not a wall.
   *
   * Inside Maharashtra the order goes to the customer and they decide, so the
   * button stays live and the buyer is told what to expect. Outside
   * Maharashtra the server refuses it, so the button does not pretend
   * otherwise.
   */
  const outsideArea = groups.filter(
    (g) => address && !(g.seller?.pincodes ?? []).includes(address.pincode),
  )
  const outsideState = !!address && !isMaharashtraPincode(address.pincode)

  async function place() {
    if (!address) return
    setBusy(true)
    setErr('')
    try {
      const res = await api.placeOrders({
        address: { line: address.line, landmark: address.landmark, pincode: address.pincode },
        groups,
        paymentMode: mode,
        // The customer's stored name first: the session falls back to the
        // ग्राहक placeholder, and sending that would overwrite nothing but
        // tell the seller nothing either.
        customerName: customer?.name || session?.name || t('common.customer'),
      })
      clear()
      toast(t('ok.orderPlaced'))
      nav(`/shop/placed/${res.orders[0]!.id}`, { replace: true })
    } catch (e) {
      setErr(e instanceof ApiError ? (e.messageMr ?? e.message) : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AppBar title={t('cus.checkout')} backTo="/shop/cart" />
      <div className="screen stack">
        <div>
          <SectionTitle>
            {addresses.length === 0 ? t('cus.firstAddress') : t('cus.chooseAddress')}
          </SectionTitle>

          {/*
            The customer's first order has no address to pick, so the form IS the step.
            Before customers had records of their own this screen showed two
            seeded addresses belonging to nobody, and there was no way to enter
            one - an empty picker here would simply block checkout.
          */}
          {addresses.length === 0 || addingAddress ? (
            <Card>
              {addresses.length === 0 && (
                <p className="small dim">{t('cus.firstAddressSub')}</p>
              )}
              <AddressForm
                busy={savingAddress}
                onSubmit={saveAddress}
                onCancel={addresses.length > 0 ? () => setAddingAddress(false) : undefined}
              />
            </Card>
          ) : (
            <div className="stack-sm">
              {addresses.map((a) => (
                <Choice
                  key={a.id}
                  selected={address?.id === a.id}
                  onSelect={() => setAddressId(a.id)}
                  icon={a.label === 'घर' ? <IconAddressHome /> : <IconAddressOther />}
                  title={a.label}
                  sub={addressLine(a)}
                />
              ))}
              <Button variant="ghost" size="sm" onClick={() => setAddingAddress(true)}>
                <IconPlus aria-hidden="true" /> {t('cus.addAddress')}
              </Button>
            </div>
          )}
        </div>

        {outsideState && <Notice tone="danger">{t('cus.outsideState')}</Notice>}

        {!outsideState && outsideArea.length > 0 && (
          <Notice tone="warn">
            {outsideArea.map((g) => g.seller?.shopName).join(', ')} — {t('cus.askSeller')}
          </Notice>
        )}

        <div>
          <SectionTitle>{t('cus.choosePayment')}</SectionTitle>
          <div className="stack-sm">
            <Choice selected={mode === 'COD'} onSelect={() => setMode('COD')} icon={<IconCash />} title={t('cus.payCod')} />
            <Choice
              selected={mode === 'UPI'}
              onSelect={() => setMode('UPI')}
              icon={<IconUpi />}
              title={t('cus.payUpi')}
              sub={t('cus.payUpiSub')}
            />
          </div>
        </div>

        {/* NOTHING IS PAID HERE ANY MORE.
            The buyer pays after the seller has accepted - their area list is a
            hint now, so a rejection is ordinary, and a rejected prepaid order
            leaves the money with a woman who has no way to send it back. */}
        {mode === 'UPI' && <Notice tone="info">{t('cus.payAfterAccept')}</Notice>}

        <Card>
          <div className="row-between">
            <strong>{t(groups.some((g) => g.deliveryToAsk) ? 'cus.grandTotalNoDelivery' : 'cus.grandTotal')}</strong>
            <strong style={{ fontSize: 'var(--t-lg)' }}><Rupees value={grand} /></strong>
          </div>
          {/* Said again on the last screen before she commits: this total
              is not everything she may be asked for at the door. */}
          {groups.some((g) => g.deliveryToAsk) && (
            <div className="small dim" style={{ marginTop: 6 }}>{t('cart.deliveryAskHint')}</div>
          )}
          {groups.length > 1 && (
            <div className="small dim" style={{ marginTop: 6 }}>
              {t('cart.sellerCount', { n: groups.length })}
            </div>
          )}
        </Card>

        {err && <Notice tone="danger">{err}</Notice>}
      </div>

      <div className="actionbar">
        <Button
          onClick={() => void place()}
          disabled={busy || !address || outsideState}
        >
          {busy ? t('common.loading') : t('cus.placeOrder')}
        </Button>
      </div>
    </>
  )
}

/* ================================================================== */
/* Order placed - the OTP is the hero of this screen                    */
/* ================================================================== */

export function OrderPlaced() {
  const { orderId } = useParams()
  const t = useT()
  const nav = useNavigate()
  const [data, loading] = useAsync(() => api.order(orderId!), [orderId])

  if (loading) return <div className="app-shell"><div className="screen"><Loading /></div></div>
  if (!data) return <div className="app-shell"><div className="screen"><EmptyState title="—" /></div></div>

  const order = data.order

  return (
    <div className="app-shell">
      <div className="screen screen--nonav stack">
        <div className="center stack-sm" style={{ paddingTop: 'var(--s5)' }}>
          <div className="bigstate bigstate--ok" aria-hidden="true"><IconAllClear /></div>
          <h1 className="h1">{t('cus.orderPlaced')}</h1>
          <p className="dim num">{order.id}</p>
        </div>

        <Card style={{ textAlign: 'center' }}>
          <p className="body muted" style={{ margin: 0 }}>{t('cus.orderPlacedNote')}</p>
        </Card>

        <Button onClick={() => nav(`/shop/orders/${order.id}`, { replace: true })}>
          {t('cus.trackOrder')}
        </Button>
        <Button variant="quiet" onClick={() => nav('/shop', { replace: true })}>
          {t('cus.startShopping')}
        </Button>
      </div>
    </div>
  )
}

/**
 * The buyer's tabs. A finished order is not something to scroll past every
 * time she checks on the one coming today, so delivered orders have their own
 * section, and so do the ones that were called off.
 */
type MyOrderTab = 'active' | 'completed' | 'cancelled'

const MY_ORDER_TABS: { id: MyOrderTab; labelKey: string; emptyKey: string }[] = [
  { id: 'active', labelKey: 'myo.active', emptyKey: 'myo.emptyActive' },
  { id: 'completed', labelKey: 'myo.completed', emptyKey: 'myo.emptyCompleted' },
  { id: 'cancelled', labelKey: 'myo.cancelled', emptyKey: 'myo.emptyCancelled' },
]

function myOrderTab(o: { status: string }): MyOrderTab {
  if (o.status === 'DELIVERED') return 'completed'
  if (o.status === 'CANCELLED' || o.status === 'REJECTED') return 'cancelled'
  return 'active'
}

export function CustomerOrders() {
  const t = useT()
  const nav = useNavigate()
  const [data, loading] = useAsync(() => api.myOrders(), [], 'orders:mine')
  const orders = data?.orders ?? []
  const [tab, setTab] = useState<MyOrderTab>('active')
  const list = orders.filter((o) => myOrderTab(o) === tab)
  const current = MY_ORDER_TABS.find((x) => x.id === tab)!

  return (
    <>
      <AppBar title={t('cus.myOrders')} backTo="/shop/profile" />
      <div className="hscroll" role="tablist" style={{ padding: 'var(--s3) var(--s4)', margin: 0 }}>
        {MY_ORDER_TABS.map((tb) => {
          const n = orders.filter((o) => myOrderTab(o) === tb.id).length
          return (
            <button
              key={tb.id}
              role="tab"
              aria-selected={tab === tb.id}
              className={`chip ${tab === tb.id ? 'chip--on' : ''}`}
              onClick={() => setTab(tb.id)}
            >
              {t(tb.labelKey)}{n > 0 && <span className="num"> ({n})</span>}
            </button>
          )
        })}
      </div>
      <div className="screen stack-sm" style={{ paddingTop: 0 }}>
        {loading ? (
          <Loading />
        ) : list.length === 0 ? (
          <Card><EmptyState icon={IconOrders} title={t(current.emptyKey)} /></Card>
        ) : (
          list.map((o) => (
            <button key={o.id} className="tile" onClick={() => nav(`/shop/orders/${o.id}`)}>
              <div className="tile__img" aria-hidden="true"><StatusIcon name={STATUS_STYLE[o.status].icon} /></div>
              <div className="tile__body">
                <div className="tile__title">{o.items.map((i) => i.name).join(', ')}</div>
                <div className="tile__meta">{o.id}</div>
                <div className="wrap-row" style={{ marginTop: 4 }}>
                  <Pill tone={STATUS_STYLE[o.status].tone} icon={<StatusIcon name={STATUS_STYLE[o.status].icon} />}>
                    {t(statusLabelKey(o.status))}
                  </Pill>
                </div>
              </div>
              <div className="tile__price"><Rupees value={o.total} /></div>
            </button>
          ))
        )}
      </div>
    </>
  )
}

export function TrackOrder() {
  const { orderId } = useParams()
  const t = useT()
  const nav = useNavigate()
  const { toast } = useToast()
  const [data, loading, setData] = useAsync(() => api.order(orderId!), [orderId])
  const [utr, setUtr] = useState('')
  const [payErr, setPayErr] = useState('')


  /**
   * Back from her UPI app. The reference number is the only thing tying a
   * payment to this order, and the tap after paying is Back - so the box gets
   * scrolled to and focused rather than waiting to be found.
   */
  const [backFromUpi, setBackFromUpi] = useState(false)
  function askForUtr() {
    setBackFromUpi(true)
    const box = document.getElementById('orderUtr')
    box?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    box?.focus({ preventScroll: true })
  }
  const waitForReturn = useReturnFromApp(askForUtr)
  const [paying, setPaying] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  if (loading) return <><AppBar title="" onBack={() => nav(-1)} /><div className="screen"><Loading /></div></>
  if (!data) return <><AppBar title="" onBack={() => nav(-1)} /><div className="screen"><EmptyState title="—" /></div></>

  const order = data.order
  const seller = data.seller
  const orderLink = seller?.upiId
    ? buildUpiLink({
        upiId: seller.upiId,
        name: seller.shopName,
        amount: order.total,
        note: `Shantai Mahila Bazar ${order.id}`,
      })
    : ''

  async function pay() {
    // The same check the server runs, so she is told what is wrong with the
    // number while it is still on screen rather than after a round trip.
    const problem = utrProblem(utr)
    if (problem) {
      setPayErr(problem)
      return
    }
    setPaying(true)
    setPayErr('')
    try {
      await api.payOrder(order.id, normalizeUtr(utr))
      setData(await api.order(order.id))
      toast(t('ok.paymentSubmitted'))
    } catch (e) {
      setPayErr(e instanceof ApiError ? (e.messageMr ?? e.message) : 'Network error')
    } finally {
      setPaying(false)
    }
  }

  return (
    <>
      <CancelOrderSheet
        order={order}
        by="customer"
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onCancelled={(o) => {
          setData({ ...data, order: o })
          toast(t('ended.youCancelled'))
        }}
      />
      <AppBar title={t('track.title')} onBack={() => nav(-1)} />
      <div className="screen stack">
        {/* What was ordered, then which order it is, then where it is - the
            order a delivery app puts them in, and the order she asks. */}
        <div className="stack-sm">
          {order.items.map((i) => (
            <div key={i.productId} className="row">
              <span className="lineicon lineicon--lg" aria-hidden="true"><IconProduct /></span>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{i.name}</div>
                <div className="small dim num">× {i.qty}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="orderno">
          <span>{t('track.orderNo')}</span>
          <CopyValue value={order.id} copiedText={t('track.copied')} />
        </div>

        <OrderStatusBox order={order} />

        {/* What the seller said it would take, in her own words, given at the
            moment she accepted. Directly under the status, because "when?"
            is the question the status does not answer. It is not a guarantee
            and does not pretend to be one - it is what she said. */}
        {order.deliveryEstimate && (
          <Notice tone="info" title={t('ord.etaLabel')}>{order.deliveryEstimate}</Notice>
        )}

        {/* What she said about each product, under the status that turned
            green. Asking for it is RateOrderGate's job, over the whole app. */}
        <OrderRatings
          order={order}
          reviews={data.reviews ?? []}
          onSaved={(reviews) => setData({ ...data, reviews })}
        />

        {/* The customer's number is on the ORDER, never on the catalogue: it appears once
            there is a transaction between them, and only to the person who
            placed it. A buyer waiting on food they have already paid for should
            not have to go through us to ask when it is coming. */}
        {seller && (
          <Card>
            <div className="row">
              <Avatar name={seller.shopName ?? seller.name} size={44} />
              <div className="grow">
                <div className="small dim">{t('cus.fromSeller')}</div>
                <strong>{seller.shopName}</strong>
                {seller.phone && <div className="small dim num">+91 {seller.phone}</div>}
              </div>
            </div>
            {seller.phone && (
              <div className="btn-row" style={{ marginTop: 'var(--s3)' }}>
                <a className="btn btn--ghost" href={`tel:+91${seller.phone}`}>
                  <IconCall aria-hidden="true" /> {t('cus.callSeller')}
                </a>
                <a
                  className="btn btn--ghost"
                  href={`https://wa.me/91${seller.phone}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <IconWhatsapp aria-hidden="true" /> {t('help.whatsapp')}
                </a>
              </div>
            )}
          </Card>
        )}

        {/* WHOSE TURN IT IS.
            Nothing is paid at checkout any more: the order reaches the customer's unpaid, customer accepts if they can deliver, and the money is asked for here. */}
        {order.paymentMode === 'UPI' && order.status === 'PLACED' && (
          <Notice tone="info" title={t('cus.payAfterAcceptTitle')}>{t('cus.payAfterAccept')}</Notice>
        )}

        <OrderEndedNotice order={order} viewer="customer" />
        <RefundNotice order={order} viewer="customer" />

        {/* Backing out is free until the seller says yes: nothing is paid and
            nothing is cooking. After that the button is gone and the screen
            says who to ring instead, rather than leaving her to wonder where
            it went - the call button is right above. */}
        {customerCanCancel(order.status) && (
          <Button variant="ghost" onClick={() => setCancelOpen(true)}>{t('cancel.button')}</Button>
        )}
        {sellerCanCancel(order.status) && (
          <p className="small dim">{t('cancel.cus.afterAccept')}</p>
        )}

        {awaitingCustomerPayment(order) && (
          <Card>
            <SectionTitle>{t('cus.payNowTitle')}</SectionTitle>
            <div className="stack-sm">
              {/* The QR carries the amount, and she cannot read a QR. Paying
                  the wrong number into a UPI app is the one mistake nobody on
                  either side can undo, so the figure is on the screen, in the
                  size of the thing she is being asked to do. */}
              <div className="center">
                <div className="small dim">{t('cus.amountToPay')}</div>
                <div className="hero-num"><Rupees value={order.total} /></div>
              </div>
              {/* The customer's own uploaded QR beside the generated one, not instead of
                  it: the printed code is the one they recognises, and only the
                  generated link carries the amount and the order id. */}
              {seller?.upiQrUrl && (
                <img
                  src={seller.upiQrUrl}
                  alt={t('cus.payTo')}
                  style={{ width: 170, margin: '0 auto', borderRadius: 'var(--r-sm)' }}
                />
              )}
              {seller?.upiId ? (
                <>
                  <QrCode value={orderLink} size={170} label={t('cus.payTo')} />
                  {/* One phone cannot scan its own screen, and a pay link to a
                      personal UPI ID is declined by PhonePe and Google Pay. A
                      screenshot of this QR, scanned from the gallery inside
                      her UPI app, is a payment those apps accept, amount
                      included. */}
                  <PaySteps />
                  {/* The other route those apps accept: paste the ID. Copyable,
                      not just printed - a UPI ID wrong by one character pays a
                      stranger with no way back. */}
                  <div className="dim center">{t('pay.orUpiId')}</div>
                  <CopyValue value={seller.upiId} onCopied={waitForReturn} />
                </>
              ) : (
                <Notice tone="warn">{t('qrpay.notSetUp')}</Notice>
              )}

              {backFromUpi && <Notice tone="warn">{t('pay.backAskUtr')}</Notice>}

              <Field label={t('cus.enterUtr')} hint={t('pay.utrHint')} error={payErr} required htmlFor="orderUtr">
                <TextInput
                  id="orderUtr"
                  inputMode="numeric"
                  value={utr}
                  error={!!payErr}
                  onChange={(e) => { setUtr(e.target.value.replace(/\s/g, '')); setPayErr('') }}
                  placeholder="512309887711"
                />
              </Field>
              {/* A live button under a number that cannot be a UTR reads as
                  "this is fine, press me". It is the last thing standing
                  between her and an order nobody can match to a payment. */}
              <Button onClick={() => void pay()} disabled={paying || !isValidUtr(utr)}>
                {paying ? t('common.loading') : t('cus.paidSubmit')}
              </Button>
            </div>
          </Card>
        )}

        {order.paymentMode === 'UPI' && order.paymentStatus === 'UPI_SUBMITTED' && (
          <Notice tone="warn" title={t('cus.paymentChecking')}>
            {t('pay.utr')}: <span className="num">{order.paymentUtr}</span>
          </Notice>
        )}

        <Card>
          <div className="stack-sm">
            {order.items.map((i) => (
              <div key={i.productId} className="row-between">
                <div className="row">
                  <span className="lineicon" aria-hidden="true"><IconProduct /></span>
                  <span>{i.name} × {i.qty}</span>
                </div>
                <Rupees value={i.price * i.qty} />
              </div>
            ))}
            <hr className="divider" style={{ margin: 'var(--s2) 0' }} />
            <div className="row-between">
              <strong>{t('ord.total')}</strong>
              <strong><Rupees value={order.total} /></strong>
            </div>
            <Pill tone={order.paymentStatus === 'UPI_CONFIRMED' ? 'ok' : 'neutral'}>
              {order.paymentMode === 'COD' ? t('ord.paymentCod') : t('ord.paymentUpi')}
            </Pill>
          </div>
        </Card>
      </div>
    </>
  )
}

export function CustomerProfile() {
  const t = useT()
  const nav = useNavigate()
  const { session, signOut, patchSession } = useAuth()
  const [data, loading, setData] = useAsync(() => api.customerMe(), [])
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)

  const customer = data?.customer
  const addresses = customer?.addresses ?? []

  /** Every mutation re-reads the customer's record, so the list can never drift. */
  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
      setData(await api.customerMe())
      setAdding(false)
      setEditing(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AppBar brand title={t('prof.title')} />
      <div className="screen stack">
        {/* The customer's name is registration data, not a display string, so it is
            editable here and written back to their customer record. They
            reads it on every order they places. */}
        <Card data-wt="cprof-name">
          <div className="row">
            <div className="tile__img" style={{ width: 56, height: 56, fontSize: '1.75rem' }}>
              <IconProfile aria-hidden="true" />
            </div>
            <div className="grow">
              <div style={{ fontWeight: 700 }}>
                {customer?.name || session?.name || t('common.customer')}
              </div>
              <div className="small dim num">+91 {session?.phone}</div>
            </div>
            {nameDraft === null && (
              <button
                type="button"
                className="linkbtn"
                onClick={() => setNameDraft(customer?.name ?? session?.name ?? '')}
              >
                {t('common.edit')}
              </button>
            )}
          </div>

          {nameDraft !== null && (
            <div className="stack-sm" style={{ marginTop: 'var(--s3)' }}>
              <Field label={t('cus.yourName')} hint={t('creg.nameHint')} required>
                <VoiceInput
                  value={nameDraft}
                  onChange={setNameDraft}
                  placeholder={t('ph.fullName')}
                />
              </Field>
              <div className="btn-row">
                <Button variant="quiet" size="sm" onClick={() => setNameDraft(null)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  size="sm"
                  disabled={busy || !nameDraft.trim()}
                  onClick={() => {
                    const name = nameDraft.trim()
                    void run(async () => {
                      const res = await api.updateCustomerMe(name)
                      patchSession({ name: res.customer.name })
                    }).then(() => setNameDraft(null))
                  }}
                >
                  {t('cus.saveName')}
                </Button>
              </div>
            </div>
          )}
        </Card>

        <button className="tile" data-wt="cprof-orders" onClick={() => nav('/shop/orders')}>
          <div className="tile__img" aria-hidden="true"><IconOrders /></div>
          <div className="tile__body"><div className="tile__title">{t('cus.myOrders')}</div></div>
          <span aria-hidden="true"><IconChevron /></span>
        </button>

        <Card data-wt="cprof-addr">
          <SectionTitle>{t('cus.savedAddresses')}</SectionTitle>

          {loading && <Loading />}

          {!loading && addresses.length === 0 && !adding && (
            <p className="small dim">{t('cus.noAddresses')}</p>
          )}

          <div className="stack-sm">
            {addresses.map((a) =>
              editing === a.id ? (
                <AddressForm
                  key={a.id}
                  initial={a}
                  busy={busy}
                  submitLabel={t('common.save')}
                  onSubmit={(input) => void run(() => api.updateAddress(a.id, input))}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div key={a.id} className="stack-sm">
                  <div className="row">
                    <strong>{a.label}</strong>
                    {a.isDefault && <Pill tone="ok">{t('cus.defaultAddress')}</Pill>}
                  </div>
                  <div className="small dim">{addressLine(a)}</div>
                  {a.landmark && <div className="small dim">{a.landmark}</div>}
                  {/* btn-row, not row: these share the width evenly instead of
                      each one sizing to its own label, which is why "Remove"
                      sat wider than "Edit" and the add button below lined up
                      with neither. */}
                  <div className="btn-row">
                    <Button variant="quiet" size="sm" onClick={() => setEditing(a.id)}>
                      {t('common.edit')}
                    </Button>
                    {!a.isDefault && (
                      <Button
                        variant="quiet"
                        size="sm"
                        disabled={busy}
                        onClick={() => void run(() => api.updateAddress(a.id, { isDefault: true }))}
                      >
                        {t('cus.setDefault')}
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        if (confirm(t('cus.deleteAddressConfirm'))) {
                          void run(() => api.deleteAddress(a.id))
                        }
                      }}
                    >
                      {t('cus.deleteAddress')}
                    </Button>
                  </div>
                </div>
              ),
            )}
          </div>

          {adding ? (
            <AddressForm
              busy={busy}
              onSubmit={(input) => void run(() => api.addAddress(input))}
              onCancel={() => setAdding(false)}
            />
          ) : (
            /* Full width and on its own row: it acts on the LIST, not on any
               one address, so it must not read as a third button belonging to
               the last card. */
            <Button variant="ghost" onClick={() => setAdding(true)} style={{ marginTop: 'var(--s3)' }}>
              <IconPlus aria-hidden="true" /> {t('cus.addAddress')}
            </Button>
          )}
        </Card>

        {/* Help & Training for the shopper: the same four tabs the customer has at
            the bottom of the screen, each one replayed on the real page. */}
        <div>
          <SectionTitle>{t('wt.title')}</SectionTitle>
          <p className="small dim" style={{ marginTop: -4, marginBottom: 'var(--s2)' }}>
            {t('wt.sub')}
          </p>
          <TourMenu role="customer" />
        </div>

        <Card>
          <LanguagePicker />
        </Card>

        <Button variant="ghost" onClick={() => setLogoutOpen(true)}>
          {t('prof.logout')}
        </Button>

        {/* Far from Log out, for the reason the seller's is - see
            components/CloseAccount.tsx. A buyer loses an address book rather
            than an income, so there is no week to change her mind and the
            sheet says so plainly instead. */}
        <Card>
          <div className="stack-sm">
            <div className="small dim">{t('close.sectionTitle')}</div>
            <Button variant="quiet" size="sm" onClick={() => setCloseOpen(true)}>
              {t('close.open')}
            </Button>
          </div>
        </Card>
      </div>

      {/* The same step the seller gets. Getting back in costs an SMS code, and
          the one worry a shopper has about leaving - "will my cart go?" - is
          answered before she decides: it stays on this phone. */}
      <ConfirmSheet
        open={logoutOpen}
        title={t('prof.logoutConfirmTitle')}
        body={t('prof.logoutConfirmCustomer')}
        confirmLabel={t('prof.logout')}
        tone="danger"
        onCancel={() => setLogoutOpen(false)}
        onConfirm={() => { signOut(); nav('/', { replace: true }) }}
      />

      <CloseAccountSheet
        role="customer"
        phone={session?.phone ?? customer?.phone ?? ''}
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
      />

      <PageTour id="shop.profile" />
    </>
  )
}
