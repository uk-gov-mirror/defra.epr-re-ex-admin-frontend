import { errorCodes } from '#server/common/enums/error-codes.js'
import { organisationPath } from '#server/common/helpers/backend-paths.js'
import { fetchJsonFromBackend } from '#server/common/helpers/fetch-json-from-backend.js'
import { notFound } from '#server/common/helpers/logging/cdp-boom.js'
import {
  toDisplayValue,
  toValidFromDisplayValue
} from '#server/common/helpers/overseas-site-display.js'
import { registrationYearBreadcrumbs } from '#server/common/helpers/page-urls.js'

/**
 * @typedef {{
 *   name: string,
 *   address: {
 *     country: string,
 *     line1: string,
 *     line2?: string,
 *     townOrCity: string,
 *     stateOrRegion?: string,
 *     postcode?: string
 *   },
 *   coordinates?: string
 * }} OverseasSite
 *
 * @typedef {{ status: 'pending' } | { status: 'approved', approvedOn: string }} SiteApproval
 *
 * A registration's sites and an accreditation's approvals of them, each keyed
 * by three-digit ORS id.
 * @typedef {Record<string, OverseasSite>} OverseasSites
 * @typedef {Record<string, SiteApproval>} SiteApprovals
 */

export const accreditationOverseasSitesGETController = {
  async handler(request, h) {
    const { organisationNumber, registrationNumber, year } = request.params

    const organisation = await fetchJsonFromBackend(
      request,
      organisationPath(request.params),
      {}
    )
    const registration = organisation.registrations[registrationNumber]
    const accreditation = registration?.accreditations[year]

    // Only an exporter's accreditation approves overseas sites.
    if (!accreditation?.overseasSites) {
      throw notFound(
        'Accreditation not found',
        errorCodes.accreditationNotFound,
        {
          event: {
            action: 'fetch_accreditation',
            reason: `organisationNumber=${organisationNumber} registrationNumber=${registrationNumber} year=${year}`
          }
        }
      )
    }

    /** @type {OverseasSites} */
    const sites = registration.overseasSites
    /** @type {SiteApprovals} */
    const approvals = accreditation.overseasSites

    const packagingWasteCategory = toDisplayValue(registration.material)

    // The accreditation lists the sites accredited for its year, each one the
    // registration holds (ADR 0052).
    const siteRows = Object.entries(approvals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([orsId, approval]) => {
        const { name, address, coordinates } = sites[orsId]
        return [
          { text: orsId },
          { text: packagingWasteCategory },
          { text: address.country },
          { text: name },
          { text: address.line1 },
          { text: toDisplayValue(address.line2) },
          { text: address.townOrCity },
          { text: toDisplayValue(address.stateOrRegion) },
          { text: toDisplayValue(address.postcode) },
          { text: toDisplayValue(coordinates) },
          {
            text: toValidFromDisplayValue(
              approval.status === 'approved' ? approval.approvedOn : null
            )
          }
        ]
      })

    return h.view('routes/accreditation-overseas-sites/index', {
      breadcrumbs: registrationYearBreadcrumbs(request.params),
      pageTitle: request.route.settings.app.pageTitle,
      heading: `${organisation.name} - ${accreditation.accreditationNumber}`,
      siteRows
    })
  }
}
