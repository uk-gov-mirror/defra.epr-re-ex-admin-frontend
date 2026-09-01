/**
 * @typedef {object} RegistrationStatusTransition
 * @property {string} fromStatus - Status the registration must currently hold
 * @property {string} toStatus - Status posted to the backend status-history endpoint
 * @property {string} linkText - Overview action label, e.g. "Reject"
 * @property {string} pageTitle
 * @property {string} heading
 * @property {string} warningText - Confirm-page warning copy
 * @property {string} buttonText
 * @property {string} buttonClasses
 * @property {string} errorMessage - Flash fallback when the backend gives no message
 * @property {string} logMessage
 * @property {boolean} [hasGrantFields] - Confirm page collects validFrom + registrationNumber
 */

const WARNING_BUTTON_CLASS = 'govuk-button--warning'

/**
 * Expands the fields every transition entry derives the same way: the page
 * title mirrors the heading, and the error/log messages are formulaic on the
 * heading and the action's present participle (e.g. 'rejecting').
 * @param {{
 *   fromStatus: string,
 *   toStatus: string,
 *   linkText: string,
 *   heading: string,
 *   warningText: string,
 *   buttonText: string,
 *   problemVerb: string,
 *   buttonClasses?: string,
 *   hasGrantFields?: boolean
 * }} entry
 * @returns {RegistrationStatusTransition}
 */
const defineTransition = ({ problemVerb, buttonClasses = '', ...entry }) => ({
  ...entry,
  pageTitle: entry.heading,
  buttonClasses,
  errorMessage: `There was a problem ${problemVerb} the registration. Please try again.`,
  logMessage: `${entry.heading} failed`
})

/**
 * Registration status transitions the admin UI can action, keyed by the URL
 * action segment. Each entry drives a confirm page and a POST of
 * `{ fromStatus, toStatus, ...params }` to the backend status-history
 * endpoint.
 * @type {Record<string, RegistrationStatusTransition>}
 */
export const REGISTRATION_STATUS_TRANSITIONS = {
  approve: defineTransition({
    fromStatus: 'created',
    toStatus: 'approved',
    linkText: 'Approve',
    heading: 'Approve registration',
    warningText:
      'This action must only be taken following the required legal process for approval and following instruction from an industry regulator. Approving a registration registers the operator for this site and material — they must submit the registered-only summary log and report quarterly. It does not permit PRN/PERN issuing (an accreditation is required for that).',
    buttonText: 'Approve now',
    problemVerb: 'approving',
    hasGrantFields: true
  }),
  // Refusing a non-compliant application (PAE-1609): the operator is not
  // registered for the site/material — no number or validity dates involved.
  reject: defineTransition({
    fromStatus: 'created',
    toStatus: 'rejected',
    linkText: 'Reject',
    heading: 'Reject registration',
    warningText:
      'This action must only be taken following the required legal process for refusing a registration application and following instruction from an industry regulator. Rejecting a registration means the operator is not registered for this site and material: they cannot submit summary logs and have no reporting obligation',
    buttonText: 'Reject now',
    problemVerb: 'rejecting'
  }),
  // Reopening a rejected application for rework (PAE-1614).
  reopen: defineTransition({
    fromStatus: 'rejected',
    toStatus: 'created',
    linkText: 'Reopen',
    heading: 'Reopen registration',
    warningText:
      'This action must only be taken following instruction from an industry regulator. Reopening a rejected registration returns the application to created so it can be reworked and reconsidered. The operator is not registered for this site and material unless the registration is subsequently approved',
    buttonText: 'Reopen now',
    problemVerb: 'reopening'
  }),
  // Registrations cancel directly from approved (PAE-1615): there is no
  // suspended state (PAE-1705). The backend cascade also cancels the linked
  // live accreditation in the same update.
  cancel: defineTransition({
    fromStatus: 'approved',
    toStatus: 'cancelled',
    linkText: 'Cancel',
    heading: 'Cancel registration',
    warningText:
      'This action must only be taken following the required legal process for cancellation and following instruction from an industry regulator. Cancelling a registration is permanent: the operator is no longer registered for this site and material and has no reporting obligation. Any live accreditation linked to it is also cancelled, so the operator can no longer issue PRNs and tonnages declared after the cancellation will not count towards their waste balance',
    buttonText: 'Cancel registration now',
    problemVerb: 'cancelling',
    buttonClasses: WARNING_BUTTON_CLASS
  }),
  // Reinstatement after a cancellation is overturned on appeal (PAE-1616),
  // effective on the day it is actioned — not retrospective. A cascade-
  // cancelled accreditation is NOT auto-reinstated (REG9 AC4).
  reinstate: defineTransition({
    fromStatus: 'cancelled',
    toStatus: 'approved',
    linkText: 'Reinstate',
    heading: 'Reinstate registration',
    warningText:
      'This action must only be taken where a cancellation has been overturned by the required legal process (for example a successful appeal through the courts) and following instruction from an industry regulator. Reinstating restores the registration to approved from the date of reinstatement: the operator is registered for this site and material again and reporting obligations resume. A cancelled accreditation is not reinstated automatically and must be reinstated separately',
    buttonText: 'Reinstate now',
    problemVerb: 'reinstating'
  })
}

/**
 * Summary-list action items for every transition available from the given
 * registration status. Single source of truth for which actions the
 * registration overview offers on the Status row per status.
 * @param {string} status - Current registration status
 * @param {string} baseUrl - Registration URL prefix, `.../registrations/{id}`
 * @returns {Array<{href: string, text: string, visuallyHiddenText: string}>}
 */
export const registrationStatusActions = (status, baseUrl) =>
  Object.entries(REGISTRATION_STATUS_TRANSITIONS)
    .filter(([, transition]) => transition.fromStatus === status)
    .map(([action, transition]) => ({
      href: `${baseUrl}/${action}/confirm`,
      text: transition.linkText,
      visuallyHiddenText: 'registration'
    }))
