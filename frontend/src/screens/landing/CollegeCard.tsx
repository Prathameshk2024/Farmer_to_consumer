import { useState } from 'react'
import { useT } from '../../i18n/I18nProvider.js'

/**
 * The college this project is run under.
 *
 * The photograph lives in `frontend/public/college.jpg` rather than being
 * imported: it is a real photo that gets swapped for a better one, and a
 * public-folder file can be replaced without a code change or a rebuild of the
 * bundle graph.
 *
 * Which is also why the image is allowed to be missing. `onError` drops it and
 * the two address lines carry the section on their own - a broken-image icon
 * on the landing page of a trust-building product is worse than no photo, and
 * the name and address are the part that actually has to be right.
 *
 * Both languages are shown at once, not switched: the Marathi line is what a
 * villager reads and the English line is what goes into a form or a search, so
 * neither is a translation of the other that could be hidden.
 */
export default function CollegeCard() {
  const t = useT()
  const [hasImage, setHasImage] = useState(true)

  return (
    <div className={`college ${hasImage ? '' : 'college--noimg'}`}>
      {hasImage && (
        <img
          className="college__img"
          src={`${import.meta.env.BASE_URL}college.jpg`}
          alt={t('lp.collegeAlt')}
          loading="lazy"
          onError={() => setHasImage(false)}
        />
      )}

      <div className="college__body">
        <p className="college__mr" lang="mr">{t('lp.collegeMr')}</p>
        <p className="college__en" lang="en">{t('lp.collegeEn')}</p>
      </div>
    </div>
  )
}
