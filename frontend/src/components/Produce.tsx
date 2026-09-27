import type { Category, Cultivation, Unit } from '@shared/types.js'
import { CROPS } from '@shared/crops.js'
import { CULTIVATIONS, UNITS, harvestAgeDays } from '@shared/produce.js'
import { useI18n, useT } from '../i18n/I18nProvider.js'
import { CULTIVATION_ICON } from './icons.js'
import { Choice, Rupees } from './ui.js'

/**
 * The three facts every produce listing shows wherever it appears - the card,
 * the product screen, the farmer's own list and the wizard's review - so they
 * read the same everywhere.
 */

/** "₹40 / किलो". A price without its unit cannot be compared with the next farmer's. */
export function PricePerUnit({ price, unit, big }: { price: number; unit: Unit; big?: boolean }) {
  const t = useT()
  return (
    <span className="row" style={{ gap: 6, display: 'inline-flex' }}>
      <strong style={big ? { fontSize: 'var(--t-xl)' } : undefined}><Rupees value={price} /></strong>
      <span className="small dim">/ {t(`unit.${unit}`)}</span>
    </span>
  )
}

/** How it was grown: icon + word, never the icon alone. */
export function CultivationPill({ cultivation }: { cultivation: Cultivation }) {
  const t = useT()
  const Icon = CULTIVATION_ICON[cultivation]
  if (!Icon) return null
  return (
    <span className={`pill pill--${cultivation}`}>
      <span aria-hidden="true"><Icon /></span>
      {t(`cult.${cultivation}`)}
    </span>
  )
}

/** "Harvested 3 days ago" - freshness in the buyer's words, not a date to work out. */
export function useHarvestLabel(): (harvestDate: string) => string {
  const t = useT()
  return (harvestDate) => {
    if (!harvestDate) return ''
    const n = harvestAgeDays(harvestDate)
    if (n <= 0) return t('prod.harvestedToday')
    if (n === 1) return t('prod.harvestedYesterday')
    return t('prod.harvestedAgo', { n })
  }
}

/**
 * The answer widgets the wizard asks one per screen and the edit page asks
 * all at once. Shared so the two cannot offer different choices.
 */

/** Crops as chips, grouped by category the way a market is laid out. */
export function CropPicker({ value, onPick, categories, disabled }: {
  value: string
  onPick: (cropId: string) => void
  categories: Category[]
  disabled?: boolean
}) {
  const { lang } = useI18n()
  return (
    <div className="stack">
      {categories.map((c) => {
        const crops = CROPS.filter((crop) => crop.categoryId === c.id)
        if (!crops.length) return null
        return (
          <div key={c.id} className="stack-sm">
            <div className="small dim">{lang === 'mr' ? c.mr : c.en}</div>
            <div className="wrap-row">
              {crops.map((crop) => (
                <button
                  key={crop.id}
                  type="button"
                  disabled={disabled}
                  className={`chip ${value === crop.id ? 'chip--on' : ''}`}
                  onClick={() => onPick(crop.id)}
                >
                  {lang === 'mr' ? crop.mr : crop.en}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Only for the crop `other`, which has no category of its own. */
export function CategoryPicker({ value, onPick, categories, disabled }: {
  value: string
  onPick: (categoryId: string) => void
  categories: Category[]
  disabled?: boolean
}) {
  const { lang } = useI18n()
  return (
    <div className="wrap-row">
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          disabled={disabled}
          className={`chip ${value === c.id ? 'chip--on' : ''}`}
          onClick={() => onPick(c.id)}
        >
          {lang === 'mr' ? c.mr : c.en}
        </button>
      ))}
    </div>
  )
}

export function UnitPicker({ value, onPick, disabled }: {
  value: Unit
  onPick: (u: Unit) => void
  disabled?: boolean
}) {
  const t = useT()
  return (
    <div className="wrap-row">
      {UNITS.map((u) => (
        <button
          key={u}
          type="button"
          disabled={disabled}
          className={`chip ${value === u ? 'chip--on' : ''}`}
          onClick={() => onPick(u)}
        >
          {t(`unit.${u}`)}
        </button>
      ))}
    </div>
  )
}

/** Three big choices, each an icon, a word and what the word means. */
export function CultivationPicker({ value, onPick, disabled }: {
  value: Cultivation | ''
  onPick: (c: Cultivation) => void
  disabled?: boolean
}) {
  const t = useT()
  return (
    <div className="stack-sm">
      {CULTIVATIONS.map((c) => {
        const Icon = CULTIVATION_ICON[c]
        return (
          <Choice
            key={c}
            selected={value === c}
            onSelect={() => onPick(c)}
            disabled={disabled}
            icon={<Icon />}
            title={t(`cult.${c}`)}
            sub={t(`cult.${c}Hint`)}
          />
        )
      })}
    </div>
  )
}

/** Today on the farmer's calendar, for `<input type="date" max>`: no harvest tomorrow. */
export function todayIso(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10)
}
