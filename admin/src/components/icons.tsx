import type { ComponentType } from 'react'
import {
  FiAlertTriangle, FiBarChart2, FiCheck, FiCheckCircle, FiChevronLeft,
  FiChevronRight, FiClipboard, FiCopy,
  FiFileText, FiHelpCircle, FiHome, FiInbox, FiPackage, FiStar, FiUsers, FiX,
} from 'react-icons/fi'
import { MdCurrencyRupee } from 'react-icons/md'

/**
 * ICONS
 * =====
 * Same arrangement as the seller app's `components/icons.tsx`: every icon in
 * the console comes from react-icons, and every screen imports it from HERE
 * rather than from `react-icons/*` directly. The set can then be swapped in one
 * file, and a screen reads as intent (`IconPayments`) rather than as a vendor's
 * naming scheme.
 *
 * Emoji were wrong here for a reason beyond taste. This console is read on a
 * desk in Windows, where 💵 renders as a flat green rectangle and 👩 as a
 * full-colour photograph of a face - two glyphs at different visual weights
 * sitting in the same navigation column, neither of them matching the maroon
 * and cream around them. A line icon takes `currentColor`, so it belongs to
 * the palette instead of fighting it.
 */

export type IconType = ComponentType<{ size?: number | string; className?: string }>

/* --- navigation ---------------------------------------------------- */
export const IconHome: IconType = FiHome
export const IconToday: IconType = FiClipboard
export const IconPayments: IconType = MdCurrencyRupee
export const IconProducts: IconType = FiPackage
export const IconSellers: IconType = FiUsers
export const IconOrders: IconType = FiFileText
export const IconReviews: IconType = FiStar
export const IconImpact: IconType = FiBarChart2
export const IconComplaints: IconType = FiHelpCircle

/* --- states -------------------------------------------------------- */
export const IconAllClear: IconType = FiCheckCircle
export const IconWarn: IconType = FiAlertTriangle
export const IconGo: IconType = FiChevronRight
export const IconCopy: IconType = FiCopy
export const IconEmpty: IconType = FiInbox
export const IconBack: IconType = FiChevronLeft

/* --- yes / no, for a list of things she does and does not have ----- */
export const IconYes: IconType = FiCheck
export const IconNo: IconType = FiX
