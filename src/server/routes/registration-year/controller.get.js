import { errorCodes } from '#server/common/enums/error-codes.js'
import {
  accreditationFor,
  fetchOrganisationView,
  processingTypeOf,
  registrationIn,
  siteOf
} from '#server/common/helpers/fetch-organisation-view.js'
import { notFound } from '#server/common/helpers/logging/cdp-boom.js'
import { registrationBreadcrumbs } from '#server/common/helpers/page-urls.js'
import {
  fetchPeriods,
  fetchSummaryLogRows,
  fetchWasteBalance,
  toRegistrationLinks,
  toReportRows
} from '#server/common/helpers/registration-sections.js'
import {
  approvedYears,
  statusForYear,
  utcToday
} from '#server/common/helpers/registration-years.js'

/**
 * @import { LatestAccreditation, OrganisationView, RegistrationView } from '#server/common/helpers/fetch-organisation-view.js'
 * @import { AccreditationKeys } from '#server/common/helpers/natural-keys/swap-keys.js'
 */

/**
 * The year's accreditation, throwing a 404 when the year is not accredited.
 * @param {OrganisationView} organisation
 * @param {RegistrationView} registration
 * @param {AccreditationKeys} keys
 * @returns {LatestAccreditation}
 */
const accreditedYear = (organisation, registration, keys) => {
  const accreditation = accreditationFor(registration, keys.year, utcToday())

  if (!accreditation) {
    throw notFound(
      'Accreditation not found',
      errorCodes.accreditationNotFound,
      {
        event: {
          action: 'fetch_accreditation',
          reason: `organisationNumber=${organisation.organisationNumber} registrationNumber=${keys.registrationNumber} year=${keys.year}`
        }
      }
    )
  }

  return accreditation
}

/**
 * Throws a 404 unless the registration was approved without a held
 * accreditation in the year.
 * @param {OrganisationView} organisation
 * @param {RegistrationView} registration
 * @param {AccreditationKeys} keys
 * @returns {null}
 */
const registeredOnlyYear = (organisation, registration, keys) => {
  const registeredOnly =
    !accreditationFor(registration, keys.year, utcToday()) &&
    approvedYears(registration.status.timeline, utcToday()).includes(
      Number(keys.year)
    )

  if (!registeredOnly) {
    throw notFound(
      'Registered-only year not found',
      errorCodes.registeredOnlyYearNotFound,
      {
        event: {
          action: 'fetch_registered_only_year',
          reason: `organisationNumber=${organisation.organisationNumber} registrationNumber=${keys.registrationNumber} year=${keys.year}`
        }
      }
    )
  }

  return null
}

/**
 * A registration's page for one year, accredited or registered-only.
 * @param {{ accredited: boolean }} kind
 */
const registrationYearGETController = ({ accredited }) => ({
  async handler(request, h) {
    const { organisationNumber, registrationNumber, year } = request.params
    /** @type {AccreditationKeys} */
    const keys = { organisationNumber, registrationNumber, year }
    const registrationKeys = { organisationNumber, registrationNumber }

    const errorMessage = request.yar.get('error')
    await request.yar.clear('error')

    const organisation = await fetchOrganisationView(
      request,
      organisationNumber
    )
    const registration = registrationIn(organisation, registrationNumber)
    const accreditation = accredited
      ? accreditedYear(organisation, registration, keys)
      : registeredOnlyYear(organisation, registration, keys)

    const [summaryLogRows, reportingPeriods, wasteBalance] = await Promise.all([
      fetchSummaryLogRows(request, registrationKeys, year),
      fetchPeriods(request, registrationKeys, Number(year)),
      accreditation ? fetchWasteBalance(request, keys) : null
    ])

    const { wasteRecordsDownloadUrl, ...links } = toRegistrationLinks(
      registration,
      registrationKeys,
      accreditation && keys
    )

    return h.view('routes/registration-year/index', {
      breadcrumbs: registrationBreadcrumbs(keys),
      pageTitle: request.route.settings.app.pageTitle,
      heading: `${organisation.name} - ${registrationNumber} - ${year} ${accredited ? 'accredited' : 'registered only'}`,
      registration: {
        status: statusForYear(registration.status, Number(year), utcToday()),
        processingType: processingTypeOf(registration),
        material: registration.material,
        site: siteOf(registration),
        accreditation
      },
      ...links,
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
})

export const accreditedYearGETController = registrationYearGETController({
  accredited: true
})

export const registeredOnlyYearGETController = registrationYearGETController({
  accredited: false
})
