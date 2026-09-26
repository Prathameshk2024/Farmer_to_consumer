import type { Product, Unit } from '@shared/types.js'
import { needsPieceCount } from '@shared/seller.js'

/**
 * HOW MUCH IS ONE OF THESE, in words.
 *
 * "₹80" tells a buyer nothing until she knows whether that is a 200g jar or a
 * kilo, and she cannot compare two sellers without it. So every place that
 * prints a price prints this beside it: "500 ग्रॅम", "1 सेट (6 नग)".
 *
 * A listing from before the size was asked for has none, and then the unit on
 * its own is still the honest answer - "/ नग" is what those rows always said.
 */
export function sizeLabel(
  p: Pick<Product, 'unit' | 'packSize' | 'piecesPerPack'>,
  t: (key: string) => string,
): string {
  const unit = t(`unit.${p.unit as Unit}`)
  const size = Number(p.packSize ?? 0)
  const base = size > 0 ? `${size} ${unit}` : unit

  // A set of four ladoos and a set of twenty are the same word, so a set says
  // what is inside it.
  const pieces = Number(p.piecesPerPack ?? 0)
  if (needsPieceCount(p.unit) && pieces > 0) {
    return `${base} (${pieces} ${t('unit.piece')})`
  }
  return base
}
