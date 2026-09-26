type Opt = { value: string; mr: string; en: string }

export const AGE_GROUPS = [
  { value: 'u25', mr: '25 पेक्षा कमी', en: 'Under 25' },
  { value: '25-35', mr: '25 ते 35', en: '25 to 35' },
  { value: '36-50', mr: '36 ते 50', en: '36 to 50' },
  { value: '51-60', mr: '51 ते 60', en: '51 to 60' },
  { value: 'o60', mr: '60 पेक्षा जास्त', en: 'Over 60' },
] as const satisfies readonly Opt[]

/** Kept short, and phrased the way a survey would ask. */
export const EDUCATION_LEVELS = [
  { value: 'none', mr: 'शिक्षण नाही', en: 'No formal schooling' },
  { value: 'primary', mr: '4 थीपर्यंत', en: 'Up to 4th' },
  { value: 'middle', mr: '7 वीपर्यंत', en: 'Up to 7th' },
  { value: 'secondary', mr: '10 वी', en: '10th' },
  { value: 'higher', mr: '12 वी', en: '12th' },
  { value: 'graduate', mr: 'पदवी', en: 'Graduate' },
] as const satisfies readonly Opt[]

export const LANDHOLDINGS = [
  { value: 'small', mr: 'लहान (2 हेक्टरपेक्षा कमी)', en: 'Small (under 2 ha)' },
  { value: 'medium', mr: 'मध्यम (2 ते 10 हेक्टर)', en: 'Medium (2 to 10 ha)' },
  { value: 'large', mr: 'मोठे (10 हेक्टरपेक्षा जास्त)', en: 'Large (over 10 ha)' },
] as const satisfies readonly Opt[]

export const FARMER_TYPES = [
  { value: 'vegetable', mr: 'भाजीपाला', en: 'Vegetables' },
  { value: 'grain', mr: 'धान्य', en: 'Grains' },
  { value: 'fruit', mr: 'फळे', en: 'Fruit' },
  { value: 'processing', mr: 'प्रक्रिया उत्पादने', en: 'Processed products' },
] as const satisfies readonly Opt[]

export const SELLING_CHANNELS = [
  { value: 'trader', mr: 'गावातील व्यापारी', en: 'Local trader' },
  { value: 'apmc', mr: 'बाजार समिती (APMC)', en: 'APMC market' },
  { value: 'weekly', mr: 'आठवडी बाजार', en: 'Weekly market' },
  { value: 'direct', mr: 'थेट ग्राहक', en: 'Directly to buyers' },
  { value: 'online', mr: 'ऑनलाइन / WhatsApp', en: 'Online / WhatsApp' },
] as const satisfies readonly Opt[]

export const SELLING_PROBLEMS = [
  { value: 'lowPrice', mr: 'योग्य भाव मिळत नाही', en: 'Price too low' },
  { value: 'middlemen', mr: 'दलाल / मध्यस्थ जास्त', en: 'Too many middlemen' },
  { value: 'transport', mr: 'वाहतूक खर्च', en: 'Transport cost' },
  { value: 'storage', mr: 'साठवणूक नाही', en: 'No storage' },
  { value: 'noInfo', mr: 'बाजारभावाची माहिती नाही', en: 'No price information' },
  { value: 'latePayment', mr: 'पैसे उशिरा मिळतात', en: 'Late payment' },
] as const satisfies readonly Opt[]

export type AgeGroup = (typeof AGE_GROUPS)[number]['value']
export type Education = (typeof EDUCATION_LEVELS)[number]['value']
export type Landholding = (typeof LANDHOLDINGS)[number]['value']
export type FarmerType = (typeof FARMER_TYPES)[number]['value']
export type SellingChannel = (typeof SELLING_CHANNELS)[number]['value']
export type SellingProblem = (typeof SELLING_PROBLEMS)[number]['value']

/** Keep only values that are in the list: a client can send anything. */
export function pick<T extends string>(list: readonly { value: T }[], raw: unknown): T | undefined {
  return list.some((o) => o.value === raw) ? (raw as T) : undefined
}
export function pickMany<T extends string>(list: readonly { value: T }[], raw: unknown): T[] {
  return Array.isArray(raw) ? [...new Set(raw.filter((v) => list.some((o) => o.value === v)))] as T[] : []
}
