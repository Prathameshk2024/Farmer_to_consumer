import { useT } from '../../i18n/I18nProvider.js'
import { api } from '../../lib/api.js'
import { AppBar, Card, EmptyState, Loading, Notice, useAsync } from '../../components/ui.js'
import { RatingSummaryCard, ReviewList } from '../../components/Reviews.js'
import { IconStar } from '../../components/icons.js'

/**
 * WHAT BUYERS SAID ABOUT HER PRODUCTS.
 *
 * Each review names the product it is about, newest first - the same words a
 * customer reads on that product's page - under her rating, which is those
 * same reviews taken together, exactly as buyers see it on her card. She cannot reply or remove anything, because a
 * review a farmer could delete would be worth nothing to the next buyer; the
 * line under the list says who to ask about an abusive one.
 */
export function FarmerReviews() {
  const t = useT()
  const [data, loading] = useAsync(() => api.myReviews(), [])
  const reviews = data?.reviews ?? []

  return (
    <>
      <AppBar title={t('rev.title')} backTo="/farmer" />
      <div className="screen stack">
        {loading ? (
          <Loading />
        ) : reviews.length === 0 ? (
          <Card>
            <EmptyState icon={IconStar} title={t('rev.farmerEmpty')} body={t('rev.farmerEmptySub')} />
          </Card>
        ) : (
          <>
            {data && <RatingSummaryCard summary={data.summary} />}
            <ReviewList reviews={reviews} showProduct reportable />
            <Notice tone="info">{t('rev.farmerHelp')}</Notice>
          </>
        )}
      </div>
    </>
  )
}
