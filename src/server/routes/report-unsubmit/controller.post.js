import { fetchJsonFromBackend } from '#server/common/helpers/fetch-json-from-backend.js'
import { formatPeriod } from '#server/common/helpers/format-reporting-period.js'
import { statusCodes } from '#server/common/constants/status-codes.js'
import { periodSubmissionUnsubmitPath } from '#server/common/helpers/backend-paths.js'
import {
  registrationYearBreadcrumbs,
  registrationYearUrl
} from '#server/common/helpers/page-urls.js'

/**
 * @import { PeriodSubmissionRequest } from '#server/common/hapi-types.js'
 */

const REFUSED_REASON =
  'The report could not be unsubmitted because its status has changed. It may have been superseded by a later submission, or flagged for resubmission.'

export const reportUnsubmitPostController = {
  /** @param {PeriodSubmissionRequest} request */
  async handler(request, h) {
    const { registrationNumber, year, cadence, period, submissionNumber } =
      request.params

    const yearUrl = registrationYearUrl(request.params)

    /** @type {string | null} */
    let reason = null

    try {
      await fetchJsonFromBackend(
        request,
        periodSubmissionUnsubmitPath(request.params),
        {
          method: 'POST'
        }
      )
      return h.redirect(`${request.path}/result`)
    } catch (error) {
      request.logger.error({ err: error, message: 'Unsubmit report failed' })
      // The backend answers every refusal with a 409, whether the report is
      // superseded, no longer submitted, or flagged for resubmission. It does
      // not say which, so neither do we (PAE-1775).
      if (error.output?.statusCode === statusCodes.conflict) {
        reason = REFUSED_REASON
      }
    }

    return h.view('routes/report-unsubmit/result', {
      pageTitle: 'Unsubmit report',
      breadcrumbs: registrationYearBreadcrumbs(request.params),
      success: false,
      reason,
      yearUrl,
      registrationNumber,
      formattedPeriod: formatPeriod(period, cadence),
      year,
      submissionNumber
    })
  }
}
