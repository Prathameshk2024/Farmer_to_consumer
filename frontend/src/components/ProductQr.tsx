import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Product } from '@shared/types.js'
import { useT } from '../i18n/I18nProvider.js'
import { Button } from './ui.js'
import { QR_COLOURS } from './QrCode.js'
import { IconDownload, IconPrint } from './icons.js'
import { traceUrl } from '../lib/trace.js'

/**
 * A code the farmer sticks on the sack. Download gives a PNG for WhatsApp;
 * print gives one clean page (the print stylesheet hides everything else).
 */
export function ProductQr({ product, farmerName, farmerCode }: {
  product: Pick<Product, 'id' | 'name'>; farmerName: string; farmerCode: string
}) {
  const t = useT()
  const [src, setSrc] = useState<string>()
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(traceUrl(product.id), { width: 640, margin: 2, color: QR_COLOURS })
      .then((url) => { if (alive) setSrc(url) })
      .catch(() => {})
    return () => { alive = false }
  }, [product.id])
  if (!src) return null
  return (
    <div className="qr-print">
      <img src={src} alt={t('qr.alt', { name: product.name })} width={240} height={240} />
      <p className="qr-print__crop">{product.name}</p>
      <p className="qr-print__who">{farmerName} · {farmerCode}</p>
      <div className="btn-row no-print">
        <a className="btn btn--ghost" href={src} download={`${farmerCode}-${product.id}.png`}>
          <IconDownload aria-hidden="true" /> {t('common.download')}
        </a>
        <Button variant="ghost" onClick={() => window.print()}>
          <IconPrint aria-hidden="true" /> {t('qr.print')}
        </Button>
      </div>
    </div>
  )
}
