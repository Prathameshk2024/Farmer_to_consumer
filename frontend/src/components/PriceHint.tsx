import { useT } from '../i18n/I18nProvider.js'
import { api } from '../lib/api.js'
import { useAsync } from './ui.js'

/**
 * What others here ask and what the mandi paid, each with its source, under
 * the price box. Advice only: it never writes into the price field. Nothing
 * while loading or on a failure - the price can be typed without it.
 */
export function PriceHint({ cropId, unit }: { cropId: string; unit: string }) {
  const t = useT()
  const [hint] = useAsync(
    () => (cropId ? api.priceHint(cropId, unit) : Promise.reject(new Error('no crop'))),
    [cropId, unit],
  )
  const median = hint?.platform.median
  const mandi = hint?.mandi
  if (median === undefined && !mandi) return null
  const unitWord = t(`unit.${unit}`)
  return (
    <div className="small muted" style={{ marginTop: 'var(--s2)' }}>
      {median !== undefined && (
        <div>{t('hint.platform', { price: median, unit: unitWord, n: hint!.platform.listings })}</div>
      )}
      {mandi && (
        <div>
          {t('hint.mandi', {
            market: mandi.market,
            date: mandi.date.split('-').reverse().join('/'),
            price: mandi.price,
            unit: unitWord,
          })}
        </div>
      )}
      <div>{t('hint.note')}</div>
    </div>
  )
}
