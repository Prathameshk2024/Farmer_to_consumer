export interface Crop { id: string; categoryId: string; mr: string; en: string; agmarknet?: string }

/**
 * The crops around Anadur first. `agmarknet` is the commodity name the
 * government mandi-price feed uses; a crop without one gets no mandi line.
 */
export const CROPS: Crop[] = [
  { id: 'onion', categoryId: 'vegetables', mr: 'कांदा', en: 'Onion', agmarknet: 'Onion' },
  { id: 'tomato', categoryId: 'vegetables', mr: 'टोमॅटो', en: 'Tomato', agmarknet: 'Tomato' },
  { id: 'okra', categoryId: 'vegetables', mr: 'भेंडी', en: 'Okra', agmarknet: 'Bhindi(Ladies Finger)' },
  { id: 'brinjal', categoryId: 'vegetables', mr: 'वांगी', en: 'Brinjal', agmarknet: 'Brinjal' },
  { id: 'potato', categoryId: 'vegetables', mr: 'बटाटा', en: 'Potato', agmarknet: 'Potato' },
  { id: 'chilli', categoryId: 'vegetables', mr: 'हिरवी मिरची', en: 'Green chilli', agmarknet: 'Green Chilli' },
  { id: 'methi', categoryId: 'leafy', mr: 'मेथी', en: 'Fenugreek leaves', agmarknet: 'Methi(Leaves)' },
  { id: 'palak', categoryId: 'leafy', mr: 'पालक', en: 'Spinach', agmarknet: 'Spinach' },
  { id: 'coriander', categoryId: 'leafy', mr: 'कोथिंबीर', en: 'Coriander', agmarknet: 'Coriander(Leaves)' },
  { id: 'grapes', categoryId: 'fruits', mr: 'द्राक्षे', en: 'Grapes', agmarknet: 'Grapes' },
  { id: 'pomegranate', categoryId: 'fruits', mr: 'डाळिंब', en: 'Pomegranate', agmarknet: 'Pomegranate' },
  { id: 'banana', categoryId: 'fruits', mr: 'केळी', en: 'Banana', agmarknet: 'Banana' },
  { id: 'mango', categoryId: 'fruits', mr: 'आंबा', en: 'Mango', agmarknet: 'Mango' },
  { id: 'jowar', categoryId: 'grains', mr: 'ज्वारी', en: 'Jowar', agmarknet: 'Jowar(Sorghum)' },
  { id: 'wheat', categoryId: 'grains', mr: 'गहू', en: 'Wheat', agmarknet: 'Wheat' },
  { id: 'bajra', categoryId: 'grains', mr: 'बाजरी', en: 'Bajra', agmarknet: 'Bajra(Pearl Millet/Cumbu)' },
  { id: 'soybean', categoryId: 'pulses', mr: 'सोयाबीन', en: 'Soybean', agmarknet: 'Soyabean' },
  { id: 'tur', categoryId: 'pulses', mr: 'तूर', en: 'Tur (pigeon pea)', agmarknet: 'Arhar (Tur/Red Gram)(Whole)' },
  { id: 'gram', categoryId: 'pulses', mr: 'हरभरा', en: 'Gram', agmarknet: 'Bengal Gram(Gram)(Whole)' },
  { id: 'moong', categoryId: 'pulses', mr: 'मूग', en: 'Moong', agmarknet: 'Green Gram (Moong)(Whole)' },
  { id: 'turmeric', categoryId: 'spices', mr: 'हळद', en: 'Turmeric', agmarknet: 'Turmeric' },
  { id: 'jaggery', categoryId: 'processed', mr: 'गूळ', en: 'Jaggery', agmarknet: 'Gur(Jaggery)' },
  { id: 'other', categoryId: 'other', mr: 'इतर', en: 'Other' },
]

export function cropById(id: string | undefined): Crop | undefined {
  return CROPS.find((c) => c.id === id)
}
