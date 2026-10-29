import {
  fetchOrganisationView,
  latestAccreditation,
  processingTypeOf,
  registrationIn,
  siteOf
} from '#server/common/helpers/fetch-organisation-view.js'
import {
  fetchPeriods,
  fetchSummaryLogRows,
  fetchWasteBalance,
  toRegistrationLinks,
  toReportRows
} from '#server/common/helpers/registration-sections.js'
import { organisationOverviewUrl } from '#server/common/helpers/page-urls.js'

/**
 * @import { RegistrationKeys } from '#server/common/helpers/natural-keys/swap-keys.js'
 */

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
    const accreditation = latestAccreditation(registration)
    const accreditationKeys = accreditation && {
      ...registrationKeys,
      year: accreditation.year
    }

    const [summaryLogRows, reportingPeriods, wasteBalance] = await Promise.all([
      fetchSummaryLogRows(request, registrationKeys),
      // Current year until PAE-2153 lists every year.
      fetchPeriods(request, registrationKeys, new Date().getUTCFullYear()),
      accreditationKeys ? fetchWasteBalance(request, accreditationKeys) : null
    ])

    const pageTitle = request.route.settings.app.pageTitle

    return h.view('routes/registration-overview/index', {
      breadcrumbs: [
        { text: 'Organisations', href: '/organisations' },
        {
          text: 'Organisation overview',
          href: organisationOverviewUrl({ organisationNumber })
        }
      ],
      pageTitle,
      heading: `${organisation.name} - ${registrationNumber}`,
      registration: {
        status: registration.status.current,
        processingType: processingTypeOf(registration),
        material: registration.material,
        site: siteOf(registration),
        accreditation
      },
      ...toRegistrationLinks(registration, registrationKeys, accreditationKeys),
      reportRows: toReportRows(
        registrationKeys,
        reportingPeriods,
        request.auth.credentials.scopes
      ),
      summaryLogRows,
      wasteBalance,
      error: errorMessage
    })
  }
}
