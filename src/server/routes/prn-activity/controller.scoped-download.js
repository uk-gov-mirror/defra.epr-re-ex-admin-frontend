import { fetchJsonFromBackend } from '#server/common/helpers/fetch-json-from-backend.js'
import { accreditationPath } from '#server/common/helpers/backend-paths.js'
import { accreditationYearUrl } from '#server/common/helpers/page-urls.js'
import { generateCsv } from './controller.download.js'

const statuses =
  'awaiting_authorisation,awaiting_acceptance,accepted,awaiting_cancellation,cancelled'

/**
 * The backend names glass by its recycling process; the CSV says glass, as the
 * all-PRNs download does.
 * @param {string} material
 */
const toCsvMaterial = (material) =>
  material.startsWith('glass') ? 'glass' : material

/**
 * @param {Record<string, any>} a
 * @param {Record<string, any>} b
 */
const oldestFirst = (a, b) =>
  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()

/**
 * A PRN as the backend serves it under its accreditation, put into the row
 * shape the PRN activity CSV reads.
 * @param {Record<string, any>} prn
 */
const toCsvRow = (prn) => {
  const { accreditation } = prn.issuer.registration

  return {
    prnNumber: prn.prnNumber,
    status: prn.status.current,
    issuedToOrganisation: prn.issuedToOrganisation,
    tonnage: prn.tonnage,
    material: toCsvMaterial(accreditation.material),
    processToBeUsed: prn.processToBeUsed,
    isDecemberWaste: prn.isDecemberWaste,
    issuedAt: prn.issued?.at,
    issuedBy: prn.issued?.by,
    accreditationNumber: accreditation.accreditationNumber,
    accreditationYear: accreditation.accreditationYear,
    obligationYear: prn.obligationYear,
    submittedToRegulator: accreditation.submittedToRegulator.code,
    organisationName: prn.issuer.name,
    wasteProcessingType: accreditation.wasteProcessingType
  }
}

/**
 * Downloads PRN activity for a single accreditation as CSV. Triggered from the
 * registration overview page so a regulator can download just one org's PRNs.
 */
export const prnActivityScopedDownloadController = {
  async handler(request, h) {
    const { registrationNumber, year } = request.params

    try {
      const data = await fetchJsonFromBackend(
        request,
        `${accreditationPath(request.params)}/packaging-recycling-notes?statuses=${statuses}`
      )
      const csv = await generateCsv(
        (data?.items || []).toSorted(oldestFirst).map(toCsvRow)
      )

      return h
        .response(csv)
        .header('Content-Type', 'text/csv')
        .header(
          'Content-Disposition',
          `attachment; filename="prn-activity-${registrationNumber}-${year}.csv"`
        )
    } catch (error) {
      const errorMessage =
        error.output?.payload?.message ||
        'There was a problem downloading the PRN activity data. Please try again.'

      request.yar.set('error', errorMessage)

      return h.redirect(accreditationYearUrl(request.params))
    }
  }
}
