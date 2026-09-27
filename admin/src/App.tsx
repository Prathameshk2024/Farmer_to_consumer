import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { I18nProvider } from './i18n/I18nProvider.js'
import { AuthProvider, useAuth } from './store/AuthContext.js'
import { ToastProvider } from './store/ToastContext.js'
import { Shell } from './components/Shell.js'
import { SignIn } from './screens/SignIn.js'
import { Home } from './screens/Home.js'
import { Today } from './screens/Today.js'
import { Products } from './screens/Products.js'
import { Farmers } from './screens/Farmers.js'
import { FarmerDetail } from './screens/FarmerDetail.js'
import { Orders } from './screens/Orders.js'
import { Reviews } from './screens/Reviews.js'
import { Complaints } from './screens/Complaints.js'
import { Impact } from './screens/Impact.js'
import { PasswordRequests } from './screens/PasswordRequests.js'
import { Demand } from './screens/Demand.js'
import { MapScreen } from './screens/MapScreen.js'
import { Surveys } from './screens/Surveys.js'
import { Research } from './screens/Research.js'
import { Payments } from './screens/Payments.js'

/**
 * The admin console.
 *
 * Deployed separately from the farmer app - its own Vercel project - but
 * pointed at the same API, and importing the same `shared/` types so a change
 * to Farmer or Product cannot silently break one and not the other.
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
        <Route path="/farmers" element={<Farmers />} />
        <Route path="/farmers/:farmerId" element={<FarmerDetail />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/complaints" element={<Complaints />} />
        <Route path="/impact" element={<Impact />} />
        <Route path="/password-requests" element={<PasswordRequests />} />
        <Route path="/demand" element={<Demand />} />
        <Route path="/map" element={<MapScreen />} />
        <Route path="/surveys" element={<Surveys />} />
        <Route path="/research" element={<Research />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
