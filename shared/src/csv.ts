/** UTF-8 with a BOM and CRLF: what Excel on a college PC opens without mangling Devanagari. */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
