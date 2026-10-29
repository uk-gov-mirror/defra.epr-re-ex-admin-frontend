import { fetchJsonFromBackend } from '#server/common/helpers/fetch-json-from-backend.js'
import {
  accreditationPath,
  organisationPath
} from '#server/common/helpers/backend-paths.js'
import { registrationYearBreadcrumbs } from '#server/common/helpers/page-urls.js'

/**
 * Shown when an event carries no December portion. The backend omits the
 * December fields whenever a balance has never held December tonnage: an output
 * accreditation, or an input balance before its first December load. Absence is
 * a genuine "no December portion" state, not a missing value, so it reads as a
 * dash rather than a blank cell. A materialised December portion of zero (one
 * that existed and was resubmitted back to nil) still renders as zero.
 */
const ABSENT_AMOUNT = '-'

/**
 * One entry of a waste balance ledger, as the backend answers it.
 *
 * An event concerns a summary log or a note, never both, and states that one
 * subject under a key that names it.
 * @typedef {{
 *   number: number,
 *   kind: string,
 *   createdAt: string,
 *   createdBy: { id: string, name?: string, email?: string },
 *   balance: {
 *     opening: { total: number, available: number, decemberTotal?: number, decemberAvailable?: number },
 *     closing: { total: number, available: number, decemberTotal?: number, decemberAvailable?: number }
 *   },
 *   summaryLog?: { id: string, creditTotal: number },
 *   prn?: { id: string, tonnage: number }
 * }} LedgerEvent
 */

/**
 * The thing the event concerns, under the key that names it. The page shows it
 * raw, so the key has to travel with the value: an `id` alone says which
 * record without saying which kind of record.
 * @param {LedgerEvent} event
 * @returns {string}
 */
const subjectOf = (event) =>
  JSON.stringify(
    event.summaryLog ? { summaryLog: event.summaryLog } : { prn: event.prn }
  )

/**
 * Format an actor for display: "Name (email)", "Name", "email", or "".
 * @param {{ id: string, name?: string, email?: string }} actor
 * @returns {string}
 */
const formatActor = (actor) => {
  const { name, email } = actor
  if (name && email) {
    return `${name} (${email})`
  }
  return name ?? email ?? ''
}

export const wasteBalanceEventsGETController = {
  async handler(request, h) {
    const { registrationNumber, year } = request.params

    // The ledger read is not found unless the accreditation is, so the
    // organisation read holds it.
    const [organisation, { events }] = await Promise.all([
      fetchJsonFromBackend(request, organisationPath(request.params), {}),
      /** @type {Promise<{ events: LedgerEvent[] }>} */ (
        fetchJsonFromBackend(
          request,
          `${accreditationPath(request.params)}/ledger`,
          {}
        )
      )
    ])

    const { accreditationNumber } =
      organisation.registrations[registrationNumber].accreditations[year]

    const heading = `${organisation.name} - ${accreditationNumber}`

    const eventRows = events.map((event) => ({
      number: event.number,
      kind: event.kind,
      createdAt: event.createdAt,
      createdBy: formatActor(event.createdBy),
      subject: subjectOf(event),
      closingAmount: event.balance.closing.total,
      closingAvailableAmount: event.balance.closing.available,
      closingDecemberAmount:
        event.balance.closing.decemberTotal ?? ABSENT_AMOUNT,
      closingDecemberAvailableAmount:
        event.balance.closing.decemberAvailable ?? ABSENT_AMOUNT
    }))

    return h.view('routes/waste-balance-events/index', {
      breadcrumbs: registrationYearBreadcrumbs(request.params),
      pageTitle: request.route.settings.app.pageTitle,
      heading,
      eventRows
    })
  }
}
