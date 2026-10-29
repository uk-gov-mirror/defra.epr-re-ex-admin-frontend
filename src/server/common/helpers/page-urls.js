import {
  accreditationPath,
  organisationPath,
  periodSubmissionPath,
  registrationPath
} from './backend-paths.js'

/**
 * @import { PeriodSubmissionParams } from './backend-paths.js'
 */

/** Admin pages addressed by natural keys. */

/**
 * @param {{ organisationNumber: string }} keys
 */
export const organisationOverviewUrl = (keys) =>
  `${organisationPath(keys)}/overview`

/**
 * @param {{ organisationNumber: string }} keys
 */
export const unlinkDefraIdUrl = (keys) =>
  `${organisationPath(keys)}/unlink-defra-id`

/**
 * @param {{ organisationNumber: string, registrationNumber: string }} keys
 */
export const registrationOverviewUrl = (keys) =>
  `${registrationPath(keys)}/overview`

/**
 * A registration's page for an accredited year.
 * @param {{ organisationNumber: string, registrationNumber: string, year: string }} keys
 */
export const accreditationYearUrl = (keys) => accreditationPath(keys)

/**
 * A registration's page for a registered-only year.
 * @param {{ organisationNumber: string, registrationNumber: string, year: string }} keys
 */
export const registeredOnlyYearUrl = (keys) =>
  `${registrationPath(keys)}/registered-only/${encodeURIComponent(keys.year)}`

/**
 * A registration's page for a year, which sends the browser on to the
 * accredited or registered-only page for it.
 * @param {{ organisationNumber: string, registrationNumber: string, year: string }} keys
 */
export const registrationYearUrl = (keys) =>
  `${registrationPath(keys)}/years/${encodeURIComponent(keys.year)}`

/**
 * The breadcrumbs of a page under a registration.
 * @param {{ organisationNumber: string, registrationNumber: string }} keys
 */
export const registrationBreadcrumbs = (keys) => [
  { text: 'Organisations', href: '/organisations' },
  { text: 'Organisation overview', href: organisationOverviewUrl(keys) },
  { text: 'Registration overview', href: registrationOverviewUrl(keys) }
]

/**
 * The breadcrumbs of a page under one of a registration's years.
 * @param {{ organisationNumber: string, registrationNumber: string, year: string }} keys
 */
export const registrationYearBreadcrumbs = (keys) => [
  ...registrationBreadcrumbs(keys),
  { text: String(keys.year), href: registrationYearUrl(keys) }
]

/**
 * A report submission's page, at the backend's path for now.
 * @param {PeriodSubmissionParams} params
 */
export const reportSubmissionUrl = (params) => periodSubmissionPath(params)

/**
 * @param {{ organisationNumber: string, registrationNumber: string, year: string }} keys
 */
export const wasteBalanceEventsUrl = (keys) =>
  `${accreditationPath(keys)}/waste-balance-events`

/**
 * @param {{ organisationNumber: string, registrationNumber: string, year: string }} keys
 */
export const overseasSitesUrl = (keys) =>
  `${accreditationPath(keys)}/overseas-sites`

/**
 * @param {{ organisationNumber: string, registrationNumber: string, year: string }} keys
 */
export const prnActivityDownloadUrl = (keys) =>
  `${accreditationPath(keys)}/prn-activity/download`

/**
 * @param {{ organisationNumber: string, registrationNumber: string, summaryLogId: string }} keys
 */
export const summaryLogUrl = (keys) =>
  `${registrationPath(keys)}/summary-logs/${encodeURIComponent(keys.summaryLogId)}`

/**
 * @param {PeriodSubmissionParams} params
 */
export const reportUnsubmitUrl = (params) =>
  `${reportSubmissionUrl(params)}/unsubmit`
