import { fetchJsonFromBackend } from '#server/common/helpers/fetch-json-from-backend.js'
import { registrationPath } from '#server/common/helpers/backend-paths.js'
import { registrationYearBreadcrumbs } from '#server/common/helpers/page-urls.js'

/**
 * Renders the whole stored summary log document as pretty-printed JSON for
 * support triage. The backend /document endpoint returns the document as
 * stored (including loadsByReportingPeriod), so the page dumps it verbatim
 * rather than reshaping - the raw view is the point.
 *
 * A missing log surfaces as the backend's 404, which propagates to the
 * standard not-found page; a backend 403 (caller lacks summary-log.read /
 * organisation.read) renders the standard forbidden page. Neither is caught
 * here.
 */
export const summaryLogDocumentGetController = {
  async handler(request, h) {
    const { summaryLogId } = request.params

    const summaryLog = await fetchJsonFromBackend(
      request,
      `${registrationPath(request.params)}/summary-logs/${encodeURIComponent(summaryLogId)}/document`
    )

    return h.view('routes/summary-log-document/index', {
      pageTitle: request.route.settings.app.pageTitle,
      breadcrumbs: registrationYearBreadcrumbs({
        ...request.params,
        year: String(summaryLog.year)
      }),
      summaryLog
    })
  }
}
