import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react'
import { dictionaries, LANGS, type LangCode } from './strings.js'

interface I18nValue {
  lang: LangCode
  setLang: (code: LangCode) => void
  t: (key: string, vars?: Record<string, string | number>) => string
  langs: typeof LANGS
}

const I18nContext = createContext<I18nValue | null>(null)
const STORAGE_KEY = 'wb.lang'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'mr'
    } catch {
      return 'mr'
    }
  })

  const setLang = useCallback((code: LangCode) => {
    setLangState(code)
    try {
      localStorage.setItem(STORAGE_KEY, code)
    } catch {
      /* private mode - the choice just will not persist */
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  /** t('biz.slotsUsed', { used: 3, total: 5 }) */
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = dictionaries[lang][key] ?? dictionaries.en[key] ?? key
      if (!vars) return raw
      return Object.keys(vars).reduce(
        (acc, k) => acc.replaceAll(`{${k}}`, String(vars[k])),
        raw,
      )
    },
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang, t, langs: LANGS }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}

export function useT() {
  return useI18n().t
}
