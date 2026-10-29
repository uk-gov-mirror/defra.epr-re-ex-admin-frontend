import { fetchJsonFromBackend } from '#server/common/helpers/fetch-json-from-backend.js'
import { periodSubmissionDetailPath } from '#server/common/helpers/backend-paths.js'
import { registrationYearBreadcrumbs } from '#server/common/helpers/page-urls.js'

/**
 * @import { PeriodSubmissionRequest } from '#server/common/hapi-types.js'
 */

export const reportDetailGETController = {
  /** @param {PeriodSubmissionRequest} request */
  async handler(request, h) {
    const { year, cadence, period, submissionNumber } = request.params

    const data = await fetchJsonFromBackend(
      request,
      periodSubmissionDetailPath(request.params),
      {}
    )

    const pageTitle = request.route.settings.app?.pageTitle
    const heading = `Report – ${year} ${cadence} period ${period} submission ${submissionNumber}`

    return h.view('routes/reports/index', {
      breadcrumbs: registrationYearBreadcrumbs(request.params),
      pageTitle,
      heading,
      reportJson: JSON.stringify(data, null, 2)
    })
  }
}
