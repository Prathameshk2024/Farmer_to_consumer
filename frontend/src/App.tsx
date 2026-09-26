import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import {
  Navigate, Route, BrowserRouter as Router, Routes, useLocation, useNavigationType,
} from 'react-router-dom'
import type { Role } from '@shared/types.js'
import { I18nProvider } from './i18n/I18nProvider.js'
import { AuthProvider, homeFor, useAuth } from './store/AuthContext.js'
import { ToastProvider } from './store/ToastContext.js'
import { CartProvider } from './store/CartContext.js'
import { liveTicket } from './lib/registerTicket.js'
import { PincodeProvider } from './store/PincodeContext.js'
import {
  RESTORE_TICK_MS, RESTORE_WINDOW_MS, makeRestorer, recallScroll, rememberScroll,
} from './lib/scrollMemory.js'
import { CustomerLayout, SellerLayout } from './components/layouts.js'
import OfflineScreen from './components/OfflineScreen.js'
import PushBridge from './components/PushBridge.js'

import Landing from './screens/landing/Landing.js'
import DeleteAccount from './screens/landing/DeleteAccount.js'
import { OtpScreen, PhoneScreen } from './screens/auth/Auth.js'
import SellerRegister from './screens/auth/SellerRegister.js'
import CustomerRegister from './screens/auth/CustomerRegister.js'
import Notifications from './screens/Notifications.js'

import MyBusiness from './screens/seller/MyBusiness.js'
import MyProducts from './screens/seller/MyProducts.js'
import UploadProduct from './screens/seller/UploadProduct.js'
import EditProduct from './screens/seller/EditProduct.js'
import EditProfile from './screens/seller/EditProfile.js'
import { SellerOrderDetail, SellerOrders } from './screens/seller/Orders.js'
import { PaymentWaiting, Subscription } from './screens/seller/Subscription.js'
import { SellerGrowth, SellerHelp, SellerProfile } from './screens/seller/Misc.js'
import { MyBuyers } from './screens/seller/MyBuyers.js'
import { SellerReviews } from './screens/seller/Reviews.js'
import PaymentQr from './screens/seller/PaymentQr.js'

import {
  Categories, CategoryProducts, Explore, ProductDetail, SellerShop,
} from './screens/customer/Browse.js'
import {
  Cart, Checkout, CustomerOrders, CustomerProfile, OrderPlaced, TrackOrder,
} from './screens/customer/CartCheckout.js'

/**
 * NOTE: there is no /admin route here, and that is deliberate.
 * The client wants the admin console as a separate site, so this app ships the
 * seller and customer experiences only. Everything an admin console needs is
 * exposed as JSON by the backend at /api/admin/*.
 */

/**
 * A wrong-role session is sent to its OWN home, never to the landing page.
 * Bouncing a signed-in seller out to `/` for touching a customer URL reads
 * exactly like being logged out, which is the thing this app must never do by
 * accident.
 */
function Require({ role, children }: { role: Role; children: ReactNode }) {
  const { session } = useAuth()
  if (!session) return <Navigate to="/" replace />
  if (session.role !== role) return <Navigate to={homeFor(session.role)} replace />
  return <>{children}</>
}

/**
 * The wizard needs a verified number, not a session.
 *
 * `/sellers/register` takes her phone out of a single-use ticket and ignores
 * the one in the body, so without a ticket the six screens end in a refusal
 * she cannot act on. Send her to the OTP screen up front instead - which, if
 * she does still hold a live ticket, offers to carry on rather than spending
 * another SMS.
 *
 * A seller session passes too: the last thing the wizard does is spend the
 * ticket and sign her in, and it is still on screen showing her new ID.
 */
function RequireTicket({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  if (!liveTicket() && session?.role !== 'seller') {
    return <Navigate to="/login/seller" replace />
  }
  return <>{children}</>
}

/**
 * A NEW SCREEN STARTS AT THE TOP. THE ONE SHE COMES BACK TO DOES NOT.
 *
 * This began as `scrollTo(0, 0)` on every route change, which fixed the
 * forward case - a product page opening halfway down because the catalogue
 * was - and broke the backward one: she scrolled a long way down, opened the
 * tenth product, pressed back, and the list had forgotten her.
 *
 * So the position is saved per history entry and restored on POP only.
 *
 * The waiting matters as much as the restore. Every screen fetches its own
 * data, so at the moment she comes back the list is one spinner tall and the
 * browser clamps any scroll past that height. `makeRestorer` therefore keeps
 * asking while the page is too short - through the fetch, and through the
 * product photographs that change the height again as they load - instead of
 * trying a few times and giving up at the top of the catalogue.
 *
 * It stops the instant SHE scrolls. A page that yanks itself out from under a
 * reader is worse than one that starts at the top.
 */
function ScrollMemory() {
  const { key } = useLocation()
  const navigationType = useNavigationType()
  /** While the restore is walking the page, its steps are not her reading. */
  const restoring = useRef(false)

  useEffect(() => {
    // The browser's own restoration fights this one and loses on a soft
    // navigation anyway, so take it off.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  }, [])

  useEffect(() => {
    const onScroll = () => {
      // Saving mid-restore would write the clamped position of a page that is
      // still a spinner - 0 - over the place she actually left off.
      if (!restoring.current) rememberScroll(key, window.scrollY)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    /**
     * NOTHING IS SAVED ON THE WAY OUT, AND THAT IS THE FIX.
     *
     * This used to end with `rememberScroll(key, window.scrollY)`, on the
     * reasoning that leaving is the one moment the position is certainly
     * final. It is the one moment it is certainly WRONG: React has already
     * swapped the tall catalogue for a short product page by the time an
     * effect cleanup runs, the document is one screen high again, and the
     * browser has clamped the scroll to 0. So leaving overwrote "she was at
     * 1074" with "she was at the top", and Back then restored the top
     * faithfully. Every scroll she actually makes is recorded above, which is
     * all this needs.
     */
    return () => window.removeEventListener('scroll', onScroll)
  }, [key])

  /**
   * BEFORE THE PAINT, NOT AFTER IT.
   *
   * A layout effect, because an ordinary one runs after the browser has drawn
   * the frame - so Back showed the screen at the top for one frame and then
   * jumped down to her place. That blink is not the restore being slow; it is
   * the restore being one frame late. Screens she returns to render their last
   * answer immediately (`useAsync`'s cacheKey), so by the time this runs the
   * list is already its full height and the first frame she sees is the one
   * she left.
   */
  useLayoutEffect(() => {
    const target = navigationType === 'POP' ? recallScroll(key) : 0
    if (target === 0) {
      window.scrollTo(0, 0)
      return
    }

    const restorer = makeRestorer(target)
    restoring.current = true

    const stop = () => {
      if (!restoring.current) return
      restoring.current = false
      clearInterval(timer)
      clearTimeout(deadline)
      for (const ev of HER_SCROLL) window.removeEventListener(ev, stop)
      // Deliberately saves nothing: this also runs as the cleanup when she
      // navigates away, where the scroll has already been clamped to 0 by the
      // shorter screen. What she is looking at is either the position we were
      // restoring, which is already in the map, or whatever she scrolled to
      // herself, which the scroll listener recorded.
    }

    const timer = setInterval(() => {
      if (restorer.tick() === 'done') stop()
    }, RESTORE_TICK_MS)
    // A screen whose content never arrives must not leave a timer running.
    const deadline = setTimeout(stop, RESTORE_WINDOW_MS)
    for (const ev of HER_SCROLL) window.addEventListener(ev, stop, { passive: true })

    restorer.tick()
    return stop
  }, [key, navigationType])

  return null
}

/** Her own hands on the page, as opposed to our `scrollTo`. */
const HER_SCROLL = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const

export default function App() {
  return (
    <I18nProvider>
      <ToastProvider>
      <AuthProvider>
        <CartProvider>
          <PincodeProvider>
          <Router>
            <ScrollMemory />
            <PushBridge />
            <OfflineScreen />
            <Routes>
              {/* ---- public ---------------------------------------- */}
              {/* The landing page stays reachable while signed in. It used to
                  redirect, which meant a back press out of /seller landed on a
                  page that immediately threw her somewhere else - and the
                  "carry on to your shop" decision had nowhere to live. */}
              <Route path="/" element={<Landing />} />

              {/* Deleting an account, from outside the app. Google Play wants
                  this reachable in a browser by somebody who has uninstalled
                  it or lost the phone, so it is public and links to nothing
                  that needs a session. */}
              <Route path="/delete-account" element={<DeleteAccount />} />

              {/* Two doors from the landing page, one per role. Both go
                  through login; `join` is only the seller's "I am new" path. */}
              <Route path="/join/:role" element={<PhoneScreen mode="join" />} />
              <Route path="/login/:role" element={<PhoneScreen mode="login" />} />
              <Route path="/otp/:role" element={<OtpScreen />} />
              <Route
                path="/register/seller"
                element={<RequireTicket><SellerRegister /></RequireTicket>}
              />

              {/* She is signed in by the time she reaches this one - all that
                  is missing is the name, and writing it needs her token. */}
              <Route
                path="/register/customer"
                element={<Require role="customer"><CustomerRegister /></Require>}
              />

              {/* ---- seller: standalone screens (no bottom nav) ----- */}
              <Route
                path="/seller/waiting"
                element={<Require role="seller"><PaymentWaiting /></Require>}
              />

              {/* ---- seller app ------------------------------------ */}
              <Route path="/seller" element={<Require role="seller"><SellerLayout /></Require>}>
                <Route index element={<MyBusiness />} />
                <Route path="orders" element={<SellerOrders />} />
                <Route path="orders/:orderId" element={<SellerOrderDetail />} />
                <Route path="products" element={<MyProducts />} />
                <Route path="products/:productId/edit" element={<EditProduct />} />
                <Route path="upload" element={<UploadProduct />} />
                <Route path="subscription" element={<Subscription />} />
                <Route path="profile" element={<SellerProfile />} />
                <Route path="profile/edit" element={<EditProfile />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="help" element={<SellerHelp />} />
                <Route path="growth" element={<SellerGrowth />} />
                <Route path="buyers" element={<MyBuyers />} />
                <Route path="reviews" element={<SellerReviews />} />
                <Route path="payment" element={<PaymentQr />} />
              </Route>

              {/* ---- customer: standalone --------------------------- */}
              <Route
                path="/shop/placed/:orderId"
                element={<Require role="customer"><OrderPlaced /></Require>}
              />

              {/* ---- customer app ----------------------------------- */}
              <Route path="/shop" element={<Require role="customer"><CustomerLayout /></Require>}>
                <Route index element={<Explore />} />
                <Route path="categories" element={<Categories />} />
                <Route path="c/:categoryId" element={<CategoryProducts />} />
                <Route path="p/:productId" element={<ProductDetail />} />
                <Route path="seller/:sellerId" element={<SellerShop />} />
                <Route path="cart" element={<Cart />} />
                <Route path="checkout" element={<Checkout />} />
                <Route path="orders" element={<CustomerOrders />} />
                <Route path="orders/:orderId" element={<TrackOrder />} />
                <Route path="profile" element={<CustomerProfile />} />
                <Route path="notifications" element={<Notifications />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
          </PincodeProvider>
        </CartProvider>
      </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  )
}
