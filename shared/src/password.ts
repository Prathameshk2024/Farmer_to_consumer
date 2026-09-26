/**
 * THE PASSWORD RULE, ON BOTH SIDES.
 *
 * Six characters, and digits alone are fine. A farmer who has never had a
 * password remembers a number - a PIN, a date - and a composition rule
 * would only push him to write it on the phone's back cover. Five tries per
 * fifteen minutes is what makes six digits enough.
 */
export const MIN_PASSWORD = 6

export function passwordProblemMr(password: string): string | null {
  const pw = String(password ?? '')
  if (/^\s|\s$/.test(pw)) return 'पासवर्डच्या सुरुवातीला किंवा शेवटी जागा नको'
  if (pw.length < MIN_PASSWORD) return `पासवर्ड किमान ${MIN_PASSWORD} अक्षरे किंवा अंक असावा`
  return null
}
