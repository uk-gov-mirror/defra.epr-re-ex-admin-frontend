import { parseTransitionDate } from '#server/common/helpers/status-transition/transition-date.js'

/**
 * @typedef {object} DateInputValues
 * @property {string} day
 * @property {string} month
 * @property {string} year
 */

/**
 * @typedef {object} GrantFormValues
 * @property {DateInputValues} validFrom
 * @property {string} registrationNumber
 */

/**
 * Parses and validates the grant fields (valid from date parts, and the
 * registration number) from a confirm-page POST.
 * @param {Record<string, string | undefined>} payload
 * @returns {{
 *   values: GrantFormValues,
 *   errors: {
 *     validFrom?: string,
 *     registrationNumber?: string
 *   } | null,
 *   validFrom: string | null
 * }}
 */
export const parseGrantForm = (payload) => {
  const from = parseTransitionDate(
    payload,
    'validFrom',
    'Enter the date the registration is valid from'
  )
  const registrationNumber = (payload.registrationNumber ?? '').trim()

  /** @type {{ validFrom?: string, registrationNumber?: string }} */
  const errors = {}
  if (from.error) {
    errors.validFrom = from.error
  }
  if (!registrationNumber) {
    errors.registrationNumber = 'Enter a registration number'
  }

  return {
    values: {
      validFrom: { day: from.day, month: from.month, year: from.year },
      registrationNumber
    },
    errors: Object.keys(errors).length > 0 ? errors : null,
    validFrom: from.isoDate
  }
}
