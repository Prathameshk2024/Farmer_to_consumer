import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import {
  Navigate, Route, BrowserRouter as Router, Routes, useLocation, useNavigationType,
} from 'react-router-dom'
import type { Role } from '@shared/types.js'
import { I18nProvider } from './i18n/I18nProvider.js'
import { AuthProvider, homeFor, useAuth } from './store/AuthContext.js'
import { ToastProvider } from './store/ToastContext.js'
import { CartProvider } from './store/CartContext.js'
import { PincodeProvider } from './store/PincodeContext.js'
import {
  RESTORE_TICK_MS, RESTORE_WINDOW_MS, makeRestorer, recallScroll, rememberScroll,
} from './lib/scrollMemory.js'
import { CustomerLayout, FarmerLayout } from './components/layouts.js'
import OfflineScreen from './components/OfflineScreen.js'

import Landing from './screens/landing/Landing.js'
import { ForgotPasswordScreen, LoginScreen } from './screens/auth/Auth.js'
import ChangePassword from './screens/auth/ChangePassword.js'
import FarmerRegister from './screens/auth/FarmerRegister.js'
import CustomerRegister from './screens/auth/CustomerRegister.js'
import Notifications from './screens/Notifications.js'
import Trace from './screens/trace/Trace.js'

import MyBusiness from './screens/farmer/MyBusiness.js'
import MyProducts from './screens/farmer/MyProducts.js'
import UploadProduct from './screens/farmer/UploadProduct.js'
import EditProduct from './screens/farmer/EditProduct.js'
import EditProfile from './screens/farmer/EditProfile.js'
import { FarmerOrderDetail, FarmerOrders } from './screens/farmer/Orders.js'
import { FarmerGrowth, FarmerHelp, FarmerProfile } from './screens/farmer/Misc.js'
import { MyBuyers } from './screens/farmer/MyBuyers.js'
import { FarmerReviews } from './screens/farmer/Reviews.js'
import PaymentQr from './screens/farmer/PaymentQr.js'

import {
  Categories, CategoryProducts, Explore, ProductDetail, FarmerShop,
} from './screens/customer/Browse.js'
import {
  Cart, Checkout, CustomerOrders, CustomerProfile, OrderPlaced, TrackOrder,
} from './screens/customer/CartCheckout.js'
import FarmerMap from './screens/customer/FarmerMap.js'

/**
 * NOTE: there is no /admin route here, and that is deliberate.
 * The client wants the admin console as a separate site, so this app ships the
 * farmer and customer experiences only. Everything an admin console needs is
 * exposed as JSON by the backend at /api/admin/*.
 */

/**
 * A wrong-role session is sent to its OWN home, never to the landing page.
 * Bouncing a signed-in farmer out to `/` for touching a customer URL reads
 * exactly like being logged out, which is the thing this app must never do by
 * accident.
 */
function Require({ role, children }: { role: Role; children: ReactNode }) {
  const { session } = useAuth()
  if (!session) return <Navigate to="/" replace />
  if (session.role !== role) return <Navigate to={homeFor(session.role)} replace />
  // An admin reset: the server answers 403 to everything else until they
  // chooses a new password, so the app goes straight there.
  if (session.mustChangePassword) return <Navigate to="/password" replace />
  return <>{children}</>
}

/** /password: any farmer or buyer session, including a must-change one. */
function RequireSignedIn({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  if (!session || (session.role !== 'farmer' && session.role !== 'customer')) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

/**
 * A NEW SCREEN STARTS AT THE TOP. THE ONE THEY COME BACK TO DOES NOT.
 *
 * This began as `scrollTo(0, 0)` on every route change, which fixed the
 * forward case - a product page opening halfway down because the catalogue
 * was - and broke the backward one: they scrolled a long way down, opened the
 * tenth product, pressed back, and the list had forgotten them.
 *
 * So the position is saved per history entry and restored on POP only.
 *
 * The waiting matters as much as the restore. Every screen fetches its own
 * data, so at the moment they come back the list is one spinner tall and the
 * browser clamps any scroll past that height. `makeRestorer` therefore keeps
 * asking while the page is too short - through the fetch, and through the
 * product photographs that change the height again as they load - instead of
 * trying a few times and giving up at the top of the catalogue.
 *
 * It stops the instant THEY scroll. A page that yanks itself out from under a
 * reader is worse than one that starts at the top.
 */
function ScrollMemory() {
  const { key } = useLocation()
  const navigationType = useNavigationType()
  /** While the restore is walking the page, its steps are not their reading. */
  const restoring = useRef(false)

  useEffect(() => {
    // The browser's own restoration fights this one and loses on a soft
    // navigation anyway, so take it off.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  }, [])

  useEffect(() => {
    const onScroll = () => {
      // Saving mid-restore would write the clamped position of a page that is
      // still a spinner - 0 - over the place they actually left off.
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
     * browser has clamped the scroll to 0. So leaving overwrote "they were at
     * 1074" with "they were at the top", and Back then restored the top
     * faithfully. Every scroll they actually make is recorded above, which is
     * all this needs.
     */
    return () => window.removeEventListener('scroll', onScroll)
  }, [key])

  /**
   * BEFORE THE PAINT, NOT AFTER IT.
   *
   * A layout effect, because an ordinary one runs after the browser has drawn
   * the frame - so Back showed the screen at the top for one frame and then
   * jumped down to their place. That blink is not the restore being slow; it is
   * the restore being one frame late. Screens they return to render their last
   * answer immediately (`useAsync`'s cacheKey), so by the time this runs the
   * list is already its full height and the first frame they see is the one
   * they left.
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
      // Deliberately saves nothing: this also runs as the cleanup when they
      // navigates away, where the scroll has already been clamped to 0 by the
      // shorter screen. What they are looking at is either the position we were
      // restoring, which is already in the map, or whatever they scrolled to
      // themselves, which the scroll listener recorded.
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

/** Their own hands on the page, as opposed to our `scrollTo`. */
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
            <OfflineScreen />
            <Routes>
              {/* ---- public ---------------------------------------- */}
              {/* The landing page stays reachable while signed in. It used to
                  redirect, which meant a back press out of /farmer landed on a
                  page that immediately threw them somewhere else - and the
                  "carry on to your shop" decision had nowhere to live. */}
              <Route path="/" element={<Landing />} />
              <Route path="/trace/:productId" element={<Trace />} />

              {/* Each landing door is a register or a login, per role. */}
              <Route path="/login/:role" element={<LoginScreen />} />
              <Route path="/forgot-password/:role" element={<ForgotPasswordScreen />} />
              <Route path="/register/farmer" element={<FarmerRegister />} />
              <Route path="/register/customer" element={<CustomerRegister />} />
              <Route path="/password" element={<RequireSignedIn><ChangePassword /></RequireSignedIn>} />

              {/* ---- farmer app ------------------------------------ */}
              <Route path="/farmer" element={<Require role="farmer"><FarmerLayout /></Require>}>
                <Route index element={<MyBusiness />} />
                <Route path="orders" element={<FarmerOrders />} />
                <Route path="orders/:orderId" element={<FarmerOrderDetail />} />
                <Route path="products" element={<MyProducts />} />
                <Route path="products/:productId/edit" element={<EditProduct />} />
                <Route path="upload" element={<UploadProduct />} />
                <Route path="profile" element={<FarmerProfile />} />
                <Route path="profile/edit" element={<EditProfile />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="help" element={<FarmerHelp />} />
                <Route path="growth" element={<FarmerGrowth />} />
                <Route path="buyers" element={<MyBuyers />} />
                <Route path="reviews" element={<FarmerReviews />} />
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
                <Route path="farmer/:farmerId" element={<FarmerShop />} />
                <Route path="cart" element={<Cart />} />
                <Route path="checkout" element={<Checkout />} />
                <Route path="orders" element={<CustomerOrders />} />
                <Route path="orders/:orderId" element={<TrackOrder />} />
                <Route path="profile" element={<CustomerProfile />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="map" element={<FarmerMap />} />
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
