import { fetchJsonFromBackend } from '#server/common/helpers/fetch-json-from-backend.js'
import { formatPeriod } from '#server/common/helpers/format-reporting-period.js'
import { periodSubmissionDetailPath } from '#server/common/helpers/backend-paths.js'
import {
  registrationYearBreadcrumbs,
  registrationYearUrl
} from '#server/common/helpers/page-urls.js'

/**
 * @import { PeriodSubmissionRequest } from '#server/common/hapi-types.js'
 */

export const reportUnsubmitResultGetController = {
  /** @param {PeriodSubmissionRequest} request */
  async handler(request, h) {
    const { registrationNumber, year, cadence, period, submissionNumber } =
      request.params

    const yearUrl = registrationYearUrl(request.params)

    const report = await fetchJsonFromBackend(
      request,
      periodSubmissionDetailPath(request.params),
      {}
    )

    const success =
      report.status === 'ready_to_submit' &&
      Boolean(report.detail.status.unsubmitted?.at)

    if (!success) {
      return h.redirect(yearUrl)
    }

    return h.view('routes/report-unsubmit/result', {
      pageTitle: request.route.settings.app?.pageTitle,
      success: true,
      breadcrumbs: registrationYearBreadcrumbs(request.params),
      yearUrl,
      registrationNumber,
      formattedPeriod: formatPeriod(period, cadence),
      year,
      submissionNumber
    })
  }
}
