import {
  fetchOrganisationView,
  processingTypeOf,
  registrationIn,
  siteOf
} from '#server/common/helpers/fetch-organisation-view.js'
import { registrationPath } from '#server/common/helpers/backend-paths.js'
import {
  accreditationYearUrl,
  organisationOverviewUrl,
  registeredOnlyYearUrl
} from '#server/common/helpers/page-urls.js'
import {
  registrationYears,
  utcToday
} from '#server/common/helpers/registration-years.js'

/**
 * @import { RegistrationKeys } from '#server/common/helpers/natural-keys/swap-keys.js'
 */

const NOT_ACCREDITED = 'Not accredited'
const NO_VALUE = '-'

export const registrationOverviewGETController = {
  async handler(request, h) {
    const { organisationNumber, registrationNumber } = request.params
    /** @type {RegistrationKeys} */
    const registrationKeys = { organisationNumber, registrationNumber }

    const errorMessage = request.yar.get('error')
    await request.yar.clear('error')

    const organisation = await fetchOrganisationView(
      request,
      organisationNumber
    )
    const registration = registrationIn(organisation, registrationNumber)

    const yearRows = registrationYears(registration, utcToday()).map(
      ({ year, accreditation }) => ({
        year,
        isAccredited: accreditation !== null,
        accreditationStatus: accreditation?.status ?? NOT_ACCREDITED,
        accreditationNumber: accreditation?.accreditationNumber ?? NO_VALUE,
        viewUrl: accreditation
          ? accreditationYearUrl({ ...registrationKeys, year })
          : registeredOnlyYearUrl({ ...registrationKeys, year })
      })
    )

    return h.view('routes/registration-overview/index', {
      breadcrumbs: [
        { text: 'Organisations', href: '/organisations' },
        {
          text: 'Organisation overview',
          href: organisationOverviewUrl({ organisationNumber })
        }
      ],
      pageTitle: request.route.settings.app.pageTitle,
      heading: `${organisation.name} - ${registrationNumber}`,
      registration: {
        status: registration.status.current,
        processingType: processingTypeOf(registration),
        material: registration.material,
        site: siteOf(registration)
      },
      wasteRecordsDownloadUrl: `${registrationPath(registrationKeys)}/waste-records/download`,
      yearRows,
      error: errorMessage
    })
  }
}
