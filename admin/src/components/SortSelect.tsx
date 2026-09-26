import { useState } from 'react'
import { useT } from '../i18n/I18nProvider.js'
import type { SortOption } from '../lib/sort.js'

/**
 * The chosen order for one list, remembered in this browser.
 *
 * Remembered because an admin who works the payment queue oldest-first does
 * so every time, and resetting it on each visit is a click she makes forty
 * times a week. Per browser rather than per account, and wrapped in try/catch,
 * because blocked site data must cost nothing but the memory.
 */
export function useSort(list: string, options: readonly { id: string }[]) {
  const key = `admin.sort.${list}`
  const [id, setId] = useState(() => {
    try {
      const saved = localStorage.getItem(key)
      if (saved && options.some((o) => o.id === saved)) return saved
    } catch {
      /* no storage - the default is fine */
    }
    return options[0]!.id
  })

  function choose(next: string) {
    setId(next)
    try {
      localStorage.setItem(key, next)
    } catch {
      /* not remembered, still applied */
    }
  }

  return [id, choose] as const
}

export function SortSelect({
  options, value, onChange,
}: {
  options: SortOption<never>[]
  value: string
  onChange: (id: string) => void
}) {
  const t = useT()
  return (
    <label className="sortsel">
      <span className="small dim">{t('sort.label')}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{t(o.labelKey)}</option>
        ))}
      </select>
    </label>
  )
}
