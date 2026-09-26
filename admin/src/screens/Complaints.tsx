import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Complaint } from '@shared/types.js'
import { useT } from '../i18n/I18nProvider.js'
import { api } from '../lib/api.js'
import { when } from '../lib/format.js'
import { TopBar } from '../components/Shell.js'
import { IconComplaints } from '../components/icons.js'
import { Button, Card, EmptyState, ErrorNote, Loading, Pill, useAsync } from '../components/ui.js'
import { useToast } from '../store/ToastContext.js'

type Tab = 'OPEN' | 'RESOLVED' | 'ALL'

/**
 * WHAT SELLERS AND BUYERS HAVE WRITTEN TO THE DESK.
 *
 * A queue, not an archive: open ones first, and the point of the screen is to
 * empty it. Each row carries her name, her number and - for a seller - the
 * SMB id, so the answer to most of these is a phone call made from this page
 * rather than a hunt through the seller list.
 *
 * Marking one done records WHO did it, for the same reason a payment does:
 * "who answered this woman?" has to be answerable months later.
 */
export function Complaints() {
  const t = useT()
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('OPEN')
  const [data, loading, error, reload] = useAsync(() => api.complaints(tab), [tab])
  const rows = data?.complaints ?? []

  return (
    <>
      <TopBar title={t('cm.title')} sub={data ? `${data.openCount}` : undefined} />
      <div className="body stack">
        <div className="row wrap">
          {(['OPEN', 'RESOLVED', 'ALL'] as Tab[]).map((s) => (
            <Button key={s} small variant={tab === s ? 'primary' : 'quiet'} onClick={() => setTab(s)}>
              {t(`cm.tab.${s}`)}
              {s === 'OPEN' && !!data?.openCount && <> ({data.openCount})</>}
            </Button>
          ))}
        </div>

        <ErrorNote error={error} />

        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Card><EmptyState icon={IconComplaints} title={t('cm.empty')} body={t('cm.emptySub')} /></Card>
        ) : (
          <div className="stack-sm">
            {rows.map((c) => (
              <Row key={c.id} complaint={c} onDone={reload} onToast={() => toast(t('cm.resolved'))} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function Row({
  complaint, onDone, onToast,
}: {
  complaint: Complaint
  onDone: () => void
  onToast: () => void
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)

  async function resolve() {
    setBusy(true)
    try {
      await api.resolveComplaint(complaint.id)
      onToast()
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="row wrap" style={{ gap: 8, alignItems: 'baseline' }}>
        <Pill tone={complaint.resolvedAt ? 'ok' : 'warn'}>
          {t(`help.subject.${complaint.subject}`)}
        </Pill>
        <span className="strong">{complaint.name}</span>
        {/* Her own words are the row. Everything else is how to reach her. */}
        <span className="small dim">
          {complaint.byRole === 'seller' ? t('cm.fromSeller') : t('cm.fromCustomer')}
          {complaint.womenBizId && <> · <span className="mono">{complaint.womenBizId}</span></>}
        </span>
        <span className="small dim-2 grow" style={{ textAlign: 'right' }}>{when(complaint.at)}</span>
      </div>

      <p className="body" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 8 }}>
        {complaint.message}
      </p>

      <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
        <a className="btn btn--quiet btn--sm" href={`tel:+91${complaint.phone}`}>
          {t('cm.call')} +91 {complaint.phone}
        </a>
        {complaint.byRole === 'seller' && (
          <Link className="btn btn--quiet btn--sm" to={`/sellers/${complaint.byUserId}`}>
            {t('cm.openSeller')}
          </Link>
        )}
        {complaint.resolvedAt ? (
          <span className="small dim-2">{t('cm.resolvedBy', { who: complaint.resolvedBy ?? '' })}</span>
        ) : (
          <Button small disabled={busy} onClick={() => void resolve()}>{t('cm.resolve')}</Button>
        )}
      </div>
    </Card>
  )
}
