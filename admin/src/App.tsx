import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { I18nProvider } from './i18n/I18nProvider.js'
import { AuthProvider, useAuth } from './store/AuthContext.js'
import { ToastProvider } from './store/ToastContext.js'
import { Shell } from './components/Shell.js'
import { SignIn } from './screens/SignIn.js'
import { Home } from './screens/Home.js'
import { Today } from './screens/Today.js'
import { Payments } from './screens/Payments.js'
import { Products } from './screens/Products.js'
import { Sellers } from './screens/Sellers.js'
import { SellerDetail } from './screens/SellerDetail.js'
import { Orders } from './screens/Orders.js'
import { Reviews } from './screens/Reviews.js'
import { Complaints } from './screens/Complaints.js'
import { Impact } from './screens/Impact.js'

/**
 * The admin console.
 *
 * Deployed separately from the seller app - its own Vercel project - but
 * pointed at the same API, and importing the same `shared/` types so a change
 * to Seller or SubscriptionPayment cannot silently break one and not the other.
 */
export default function App() {
  return (
    <I18nProvider>
      <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  )
}

/**
 * Signed out means the sign-in screen and nothing else - no shell, no
 * navigation, no half-rendered queue behind a modal.
 */
function Gate() {
  const { session } = useAuth()
  if (!session) return <SignIn />

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Home />} />
        <Route path="/today" element={<Today />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/products" element={<Products />} />
        <Route path="/sellers" element={<Sellers />} />
        <Route path="/sellers/:sellerId" element={<SellerDetail />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/complaints" element={<Complaints />} />
        <Route path="/impact" element={<Impact />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
