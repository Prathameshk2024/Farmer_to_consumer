import { useEffect, useMemo, useRef, useState } from 'react'
import { SortSelect, useSort } from '../components/SortSelect.js'
import { ORDER_SORTS, sortRows } from '../lib/sort.js'
import type { OrderStatus } from '@shared/types.js'
import { cancelReasonKey, endingEvent } from '@shared/orderCancel.js'
import { useT } from '../i18n/I18nProvider.js'
import { IconOrders } from '../components/icons.js'
import { api, type OrderRow } from '../lib/api.js'
import { isStuck, maskedLabel, rupees, when } from '../lib/format.js'
import { TopBar } from '../components/Shell.js'
import {
  Button, Card, EmptyState, ErrorNote, Loading, Notice, Pill, useAsync,
} from '../components/ui.js'

const STATUSES: OrderStatus[] = [
  'PLACED', 'ACCEPTED', 'PACKED', 'OUT_FOR_DELIVERY',
  'DELIVERED', 'REJECTED', 'CANCELLED',
]

/**
 * Order monitoring. Read-only, and deliberately so: advancing an order is the
 * seller's action, and an admin doing it for her would put the order into a
 * state she never agreed to.
 *
 * THE BUYER IS MASKED IN THIS LIST. An admin chasing a late delivery needs to
 * know which order and which seller; she does not need a screenful of women's
 * names, phone numbers and home addresses while she scrolls. The full details
 * are one click away inside an order, where looking is a deliberate act.
 */
export function Orders() {
  const t = useT()
  const [status, setStatus] = useState('')
  const [pincode, setPincode] = useState('')
  const [open, setOpen] = useState<OrderRow | null>(null)

  const [data, loading, error] = useAsync(
    () => api.orders({ status: status || undefined, pincode: pincode || undefined }),
    [status, pincode],
  )

  const [sort, setSort] = useSort('orders', ORDER_SORTS)
  const rows = useMemo(() => sortRows(data?.orders ?? [], ORDER_SORTS, sort), [data, sort])

  return (
    <>
      <TopBar title={t('or.title')} sub={data ? `${rows.length}` : undefined} />
      <div className="body stack">

        <Notice>{t('or.readOnly')}</Notice>

        <div className="row wrap">
          <select className="select" style={{ maxWidth: 220 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('or.filterStatus')}: {t('c.all')}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            className="input"
            style={{ maxWidth: 160 }}
            placeholder={t('or.filterPincode')}
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <SortSelect options={ORDER_SORTS} value={sort} onChange={setSort} />
        </div>

        <ErrorNote error={error} />

        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Card><EmptyState icon={IconOrders} title={t('or.empty')} body={t('or.emptySub')} /></Card>
        ) : (
          <>
            <Card flush>
              <div className="tablewrap">
                <table className="t">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('or.seller')}</th>
                      <th>{t('or.customerHidden')}</th>
                      <th>{t('or.placed')}</th>
                      <th className="right">{t('or.total')}</th>
                      <th>{t('se.status')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((o) => (
                      <tr key={o.id}>
                        <td className="mono">{o.id}</td>
                        <td>{o.seller ?? '-'}</td>
                        {/* Masked. See maskCustomer() in lib/format.ts. */}
                        <td className="mono dim">{maskedLabel(o)}</td>
                        <td className="small dim">{when(o.placedAt)}</td>
                        <td className="right num">{rupees(o.total)}</td>
                        <td>
                          <div className="row" style={{ gap: 6 }}>
                            <Pill>{o.status}</Pill>
                            {isStuck(o) && <Pill tone="danger">{t('or.stuck')}</Pill>}
                          </div>
                        </td>
                        <td>
                          <Button variant="quiet" small onClick={() => setOpen(o)}>{t('or.open')}</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <div className="small dim-2">{t('or.customerHiddenNote')}</div>
          </>
        )}

        {open && <OrderDetail order={open} onClose={() => setOpen(null)} />}
      </div>
    </>
  )
}

/**
 * Inside one order the buyer is shown in full - that is the point of opening
 * it. Support cannot resolve "where is my order" without being able to call
 * the person who placed it.
 *
 * IN A DIALOG, NOT APPENDED TO THE PAGE. This used to render as one more card
 * after the table and the footnote, so opening the thirtieth row of a long
 * list drew the detail somewhere below the fold and, from the admin's side,
 * the Open button simply did nothing. `showModal()` puts it in the browser's
 * top layer - in view wherever the page is scrolled - and brings Esc, the
 * backdrop and a focus trap with it, none of which is worth hand-writing.
 */
function OrderDetail({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  const t = useT()
  const last = order.events[order.events.length - 1]
  const ended = endingEvent(order)
  const ref = useRef<HTMLDialogElement>(null)

  /* No close() in a cleanup. StrictMode runs effect, cleanup, effect in
     development, and close() queues a `close` event that lands AFTER the
     second showModal() - onClose then unmounted the dialog it had just opened,
     so Open did nothing and logged nothing. Unmounting takes the element out
     of the top layer on its own; the `open` guard covers the second run. */
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="dlg"
      onClose={onClose}
      /* A click that lands on the dialog element itself is a click on the
         backdrop - the content is inside the Card, which stops it there. */
      onClick={(e) => { if (e.target === ref.current) onClose() }}
    >
    <Card>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="strong mono">{order.id}</span>
          <Pill>{order.status}</Pill>
          {isStuck(order) && <Pill tone="danger">{t('or.stuck')}</Pill>}
        </div>
        {/* Close, not Cancel: nothing is being abandoned, this panel only reads. */}
        <Button variant="quiet" small onClick={onClose}>{t('c.close')}</Button>
      </div>

      <div className="stack-sm" style={{ marginTop: 12 }}>
        <div>
          <div className="small dim-2">{t('or.seller')}</div>
          <div>{order.seller ?? '-'} <span className="mono small dim">{order.womenBizId}</span></div>
        </div>

        <div>
          <div className="small dim-2">{t('or.customer')}</div>
          <div>{order.customerName}</div>
          <div className="mono small dim">{order.customerPhone}</div>
        </div>

        <div>
          <div className="small dim-2">{t('or.address')}</div>
          <div className="small">{order.address}</div>
          {order.landmark && <div className="small dim">{order.landmark}</div>}
          <div className="small dim mono">{order.pincode}</div>
        </div>

        <div>
          <div className="small dim-2">{t('or.items')}</div>
          <div className="stack-sm">
            {order.items.map((i) => (
              <div className="row small" key={i.productId}>
                <span className="grow">{i.name}</span>
                <span className="num dim">× {i.qty}</span>
                <span className="num">{rupees(i.price * i.qty)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="dim">{t('or.total')}</span>
          <span className="strong num">{rupees(order.total)}</span>
        </div>

        {/* Who called it off and why - the first thing support is asked about
            an order that never arrived. The code reads in the admin's own
            language; "other" and older rejects carry their own words. */}
        {ended && (
          <Notice tone="danger">
            <strong>
              {t(ended.by === 'seller' ? 'or.endedBySeller' : 'or.endedByCustomer')}
            </strong>
            {' · '}
            {ended.reason && ended.reason !== 'other' && (ended.by === 'seller' || ended.by === 'customer')
              ? t(cancelReasonKey(ended.by, ended.reason))
              : (ended.note ?? '-')}
          </Notice>
        )}

        {last && (
          <div className="small dim-2">
            {t('or.lastEvent')}: {last.to} · {when(last.at)} · {last.by}
          </div>
        )}
      </div>
    </Card>
    </dialog>
  )
}
