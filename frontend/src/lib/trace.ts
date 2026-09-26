/** The address a printed QR opens. Built from where the app is served, so a preview deploy prints its own. */
export const traceUrl = (productId: string) => `${window.location.origin}/trace/${productId}`
