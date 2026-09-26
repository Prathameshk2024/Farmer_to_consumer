import type { ComponentType } from 'react'
import type { StatusIconName } from '@shared/orderFlow.js'
import type { ProductStatusIconName } from '@shared/seller.js'
import {
  FiAlertTriangle, FiArrowLeft, FiArrowRight, FiBell, FiBriefcase, FiCamera, FiCheck,
  FiCheckCircle, FiChevronRight, FiClock, FiDownload, FiEdit2, FiFileText,
  FiCopy,
  FiGrid, FiHelpCircle, FiHome, FiImage, FiInbox, FiLock, FiMail, FiMapPin,
  FiMic, FiMinus, FiPackage, FiPause, FiPhone, FiPlay, FiPlayCircle, FiPlus,
  FiPlusCircle, FiSearch, FiShare2, FiShoppingBag, FiShoppingCart,
  FiSmartphone, FiSquare, FiStar, FiThumbsDown, FiThumbsUp, FiTrash2,
  FiTrendingDown, FiTrendingUp, FiTruck, FiUpload, FiUser, FiUsers, FiWifiOff, FiX, FiXCircle,
  FiCircle,
} from 'react-icons/fi'
import { MdCurrencyRupee, MdOutlineFastfood, MdQrCode2 } from 'react-icons/md'
import { FaWhatsapp } from 'react-icons/fa'

/**
 * ICONS
 * =====
 * Every icon in the app's chrome comes from react-icons, and every screen
 * imports it from HERE rather than from `react-icons/*` directly. One
 * indirection buys two things that matter for this codebase:
 *
 *  - the icon set can be swapped in one file, the same way `theme.css` swaps
 *    every colour from one `:root` block;
 *  - the names are what the product calls them (`IconSell`, `IconCart`), so a
 *    screen reads as intent rather than as a vendor's naming scheme.
 *
 * NO EMOJI ANYWHERE. Products, categories and order lines used to show an
 * emoji when there was no photo, statuses carried 🔔 and 🛵, and veg/non-veg
 * were 🟢 and 🔴. Emoji render differently on every phone and read as
 * decoration, so all of them are gone: a missing photo shows `IconProduct`,
 * a status draws its line icon below, and veg/non-veg is `VegMark`, drawn in
 * CSS the way the FSSAI mark is printed. The only marks left are a tick and a
 * cross - and those are icons too. `Product.emoji` is still stored; nothing
 * shows it.
 *
 * Spec section 6 says status is colour + icon + WORD. Nothing here ever stands
 * alone: every icon in this app sits beside its label, so an icon that fails
 * to load costs nothing, and `aria-hidden` is correct on all of them.
 */

export type IconType = ComponentType<{ size?: number | string; className?: string }>

/* --- navigation & chrome ------------------------------------------ */
export const IconBack: IconType = FiArrowLeft
export const IconNext: IconType = FiArrowRight
export const IconChevron: IconType = FiChevronRight
export const IconCheck: IconType = FiCheck
export const IconWarn: IconType = FiAlertTriangle
export const IconPlus: IconType = FiPlus
export const IconMinus: IconType = FiMinus
export const IconClose: IconType = FiX
export const IconEmpty: IconType = FiInbox
export const IconBell: IconType = FiBell
export const IconWaiting: IconType = FiClock
export const IconLock: IconType = FiLock
export const IconOffline: IconType = FiWifiOff
export const IconEdit: IconType = FiEdit2
export const IconCopy: IconType = FiCopy
export const IconTrash: IconType = FiTrash2
export const IconPause: IconType = FiPause
export const IconPlay: IconType = FiPlay
export const IconUp: IconType = FiTrendingUp
export const IconDown: IconType = FiTrendingDown
export const IconShare: IconType = FiShare2
export const IconDownload: IconType = FiDownload
export const IconSend: IconType = FiUpload
export const IconMail: IconType = FiMail

/* --- voice & audio ------------------------------------------------- */
export const IconMic: IconType = FiMic
export const IconMicStop: IconType = FiSquare

/* --- yes / no ------------------------------------------------------- */
export const IconYes: IconType = FiThumbsUp
export const IconNo: IconType = FiThumbsDown

/* --- the two audiences --------------------------------------------- */
export const IconSell: IconType = FiShoppingBag
export const IconBuy: IconType = FiShoppingCart
export const IconSeller: IconType = FiUser
export const IconBuyers: IconType = FiUsers
export const IconIndividual: IconType = FiUser
export const IconGroup: IconType = FiUsers

/* --- seller tabs ---------------------------------------------------- */
export const IconBusiness: IconType = FiHome
export const IconAddProduct: IconType = FiPlusCircle
export const IconProfile: IconType = FiUser
export const IconHelp: IconType = FiHelpCircle
export const IconTraining: IconType = FiPlayCircle

/* --- customer tabs -------------------------------------------------- */
export const IconExplore: IconType = FiSearch
export const IconCategories: IconType = FiGrid
export const IconCart: IconType = FiShoppingCart

/* --- things the app is made of -------------------------------------- */
export const IconProduct: IconType = FiPackage
export const IconFood: IconType = MdOutlineFastfood
export const IconOrders: IconType = FiFileText
export const IconGrowth: IconType = FiTrendingUp
export const IconAllClear: IconType = FiCheckCircle
export const IconSearch: IconType = FiSearch
export const IconStar: IconType = FiStar

/* --- getting in touch, and getting paid ----------------------------- */
export const IconCall: IconType = FiPhone
export const IconWhatsapp: IconType = FaWhatsapp
export const IconMap: IconType = FiMapPin
export const IconCash: IconType = MdCurrencyRupee
export const IconUpi: IconType = FiSmartphone

/* --- photos ---------------------------------------------------------- */
export const IconCamera: IconType = FiCamera
export const IconGallery: IconType = FiImage

/* --- addresses -------------------------------------------------------- */
export const IconAddressHome: IconType = FiHome
export const IconAddressOther: IconType = FiBriefcase

/* --- landing ---------------------------------------------------------- */
export const IconQr: IconType = MdQrCode2
export const IconVillage: IconType = FiHome
export const IconSafe: IconType = FiLock

/* --- order and listing states -------------------------------------- */
/**
 * The line icon for an order state. `STATUS_STYLE` names it; this draws it.
 * Done and ended are the tick and the cross - the only marks of that kind
 * left in the app.
 */
const STATUS_ICON: Record<StatusIconName, IconType> = {
  placed: FiBell,
  confirmed: FiThumbsUp,
  packed: FiPackage,
  onTheWay: FiTruck,
  done: FiCheckCircle,
  ended: FiXCircle,
}

export function StatusIcon({ name }: { name: StatusIconName }) {
  const Icon = STATUS_ICON[name]
  return <Icon aria-hidden="true" />
}

const PRODUCT_STATUS_ICON: Record<ProductStatusIconName, IconType> = {
  live: FiCircle,
  draft: FiEdit2,
  pending: FiClock,
  rejected: FiXCircle,
  paused: FiPause,
}

export function ProductStatusIcon({ name }: { name: ProductStatusIconName }) {
  const Icon = PRODUCT_STATUS_ICON[name]
  return <Icon aria-hidden="true" />
}

/**
 * The veg / non-veg mark: a square with a dot, green or brown-red, the way it
 * is printed on packets - drawn, so it looks the same on every phone. Always
 * beside its word; `aria-hidden` for that reason.
 */
export function VegMark({ type }: { type: 'veg' | 'nonveg' }) {
  return <span className={`vegmark vegmark--${type}`} aria-hidden="true" />
}
