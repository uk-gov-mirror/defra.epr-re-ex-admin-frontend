/**
 * @import { RegistrationView } from '#server/common/helpers/fetch-organisation-view.js'
 */

/**
 * @param {string} date - YYYY-MM-DD or an ISO timestamp
 * @returns {number}
 */
const yearOf = (date) => Number(date.slice(0, 4))

const HELD_ACCREDITATION_STATUSES = new Set(['approved', 'suspended'])

/**
 * Today's UTC date as YYYY-MM-DD.
 * @returns {string}
 */
export const utcToday = () => new Date().toISOString().slice(0, 10)

/**
 * The years from the registration's `validFrom` to this year while it is
 * approved, or to the year it was cancelled, oldest first. A registration
 * never approved has none.
 * @param {RegistrationView} registration
 * @param {string} today - YYYY-MM-DD
 * @returns {number[]}
 */
export const registeredYears = ({ validFrom, status }, today) => {
  const end = {
    approved: today,
    cancelled: status.timeline.at(-1)?.at ?? today
  }[status.current]

  if (end === undefined) {
    return []
  }

  const from = yearOf(validFrom)
  return Array.from({ length: yearOf(end) - from + 1 }, (_, i) => from + i)
}

/**
/**
 * Whether the registration's accreditation for `year` is approved or
 * suspended.
 * @param {RegistrationView} registration
 * @param {number | string} year
 * @returns {boolean}
 */
export const isAccredited = ({ accreditations }, year) =>
  Object.hasOwn(accreditations, year) &&
  HELD_ACCREDITATION_STATUSES.has(accreditations[year].status.current)

/**
 * One row per registered or accredited year, newest first. An accredited year
 * after the registered years, such as next year's accreditation approved
 * early, gets a row too.
 * @param {RegistrationView} registration
 * @param {string} today - YYYY-MM-DD
 * @returns {{
 *   year: string,
 *   accreditation: { accreditationNumber: string, status: string } | null
 * }[]}
 */
export const registrationYears = (registration, today) => {
  const years = new Set([
    ...registeredYears(registration, today),
    ...Object.keys(registration.accreditations)
      .map(Number)
      .filter((year) => isAccredited(registration, year))
  ])

  return [...years]
    .sort((a, b) => b - a)
    .map((year) => {
      const accreditation = isAccredited(registration, year)
        ? registration.accreditations[year]
        : null
      return {
        year: String(year),
        accreditation: accreditation && {
          accreditationNumber: accreditation.accreditationNumber,
          status: accreditation.status.current
        }
      }
    })
}
