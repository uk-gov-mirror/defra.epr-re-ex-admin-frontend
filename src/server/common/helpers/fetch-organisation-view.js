import { errorCodes } from '#server/common/enums/error-codes.js'
import { organisationPath } from '#server/common/helpers/backend-paths.js'
import { fetchJsonFromBackend } from '#server/common/helpers/fetch-json-from-backend.js'
import { notFound } from '#server/common/helpers/logging/cdp-boom.js'
import { isAccredited } from '#server/common/helpers/registration-years.js'

/** @import { HapiRequest } from '#server/common/hapi-types.js' */

/**
 * Every status change, oldest first.
 * @typedef {{ at: string, status: string }[]} StatusTimeline
 *
 * @typedef {{
 *   accreditationNumber: string,
 *   status: { current: string, timeline: StatusTimeline }
 * }} AccreditationView
 *
 * @typedef {{
 *   material: string,
 *   validFrom: string,
 *   status: { current: string, timeline: StatusTimeline },
 *   accreditations: Record<string, AccreditationView>
 * }} RegistrationViewCommon
 *
 * @typedef {{ line1: string, line2?: string, town: string, county?: string, postcode: string } | { fullAddress: string }} SiteAddress
 *
 * @typedef {RegistrationViewCommon & {
 *   wasteProcessingType: 'reprocessor',
 *   reprocessingType: string,
 *   site: { address: SiteAddress }
 * }} ReprocessorRegistrationView
 *
 * @typedef {RegistrationViewCommon & { wasteProcessingType: 'exporter' }} ExporterRegistrationView
 *
 * @typedef {ReprocessorRegistrationView | ExporterRegistrationView} RegistrationView
 *
 * @typedef {{
 *   defraOrganisation: { id: string, name: string },
 *   linkedAt: string,
 *   linkedBy: { email: string }
 * }} LinkedDefraOrganisationView
 *
 * @typedef {{
 *   name: string,
 *   organisationNumber: string,
 *   linkedDefraOrganisation?: LinkedDefraOrganisationView,
 *   registrations: Record<string, RegistrationView>
 * }} OrganisationView
 *
 * @typedef {{ year: string, accreditationNumber: string, status: string }} YearAccreditation
 *
 * @typedef {{
 *   registrationNumber: string,
 *   status: string,
 *   processingType: string,
 *   material: string,
 *   site: string | null
 * }} RegistrationRow
 */

/**
 * Reads the organisation's numbered records from the backend.
 * @param {HapiRequest} request
 * @param {string} organisationNumber
 * @returns {Promise<OrganisationView>}
 */
export const fetchOrganisationView = (request, organisationNumber) =>
  fetchJsonFromBackend(request, organisationPath({ organisationNumber }), {})

/**
 * The registration the organisation holds under `registrationNumber`.
 * @param {OrganisationView} organisation
 * @param {string} registrationNumber
 * @returns {RegistrationView}
 */
export const registrationIn = (organisation, registrationNumber) => {
  if (!Object.hasOwn(organisation.registrations, registrationNumber)) {
    throw notFound('Registration not found', errorCodes.registrationNotFound, {
      event: {
        action: 'fetch_registration',
        reason: `organisationNumber=${organisation.organisationNumber} registrationNumber=${registrationNumber}`
      }
    })
  }

  return organisation.registrations[registrationNumber]
}

/**
 * The registration's accreditation for `year`, or `null` when it is not
 * approved or suspended.
 * @param {RegistrationView} registration
 * @param {string} year
 * @returns {YearAccreditation | null}
 */
export const accreditationFor = (registration, year) => {
  if (!isAccredited(registration, year)) {
    return null
  }

  const { accreditationNumber, status } = registration.accreditations[year]

  return { year, accreditationNumber, status: status.current }
}

/**
 * @param {RegistrationView} registration
 * @returns {string}
 */
export const processingTypeOf = (registration) =>
  registration.wasteProcessingType === 'exporter'
    ? 'exporter'
    : `reprocessor - ${registration.reprocessingType}`

/**
 * A reprocessor's site address, or `null` for an exporter.
 * @param {RegistrationView} registration
 * @returns {string | null}
 */
export const siteOf = (registration) => {
  if (registration.wasteProcessingType === 'exporter') {
    return null
  }

  const { address } = registration.site

  return 'line1' in address ? address.line1 : address.fullAddress
}

/**
 * The organisation's registrations as overview rows, by registration number.
 * @param {OrganisationView} organisation
 * @returns {RegistrationRow[]}
 */
export const registrationRows = (organisation) =>
  Object.entries(organisation.registrations)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([registrationNumber, registration]) => ({
      registrationNumber,
      status: registration.status.current,
      processingType: processingTypeOf(registration),
      material: registration.material,
      site: siteOf(registration)
    }))
