import { config } from '#config/config.js'
import { statusCodes } from '#server/common/constants/status-codes.js'
import { getUserSession } from '#server/common/helpers/auth/get-user-session.js'
import { mockUserSession } from '#server/common/test-helpers/fixtures.js'
import { createMockOidcServer } from '#server/common/test-helpers/mock-oidc.js'
import { createServer } from '#server/server.js'
import { http, HttpResponse, server as mswServer } from '#vite/setup-msw.js'
import {
  getAllByRole,
  getByRole,
  getByText,
  queryByRole,
  queryByText,
  within
} from '@testing-library/dom'
import { Window } from 'happy-dom'
import { vi } from 'vitest'

vi.mock('#server/common/helpers/auth/get-user-session.js', () => ({
  getUserSession: vi.fn().mockReturnValue(null)
}))

describe('#accreditedYearGETController', () => {
  const originalBackendUrl = config.get('eprBackendUrl')
  const backendUrl = 'http://mock-backend'
  const organisationNumber = '500123'
  const registrationNumber = 'REG-50030-001'
  const registrationUrl = `/organisations/${organisationNumber}/registrations/${registrationNumber}`
  const url = `${registrationUrl}/accreditations/2026`
  const organisationViewUrl = `${backendUrl}/organisations/${organisationNumber}`
  let server

  beforeAll(async () => {
    config.set('eprBackendUrl', backendUrl)
    createMockOidcServer()
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    config.set('eprBackendUrl', originalBackendUrl)
    await server.stop({ timeout: 0 })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  const mockRegistration = {
    material: 'glass',
    status: {
      current: 'approved',
      timeline: [{ at: '2026-01-01T00:00:00.000Z', status: 'approved' }]
    },
    validFrom: '2026-01-01',
    wasteProcessingType: 'reprocessor',
    reprocessingType: 'input',
    site: {
      address: { line1: 'Site A', town: 'Leeds', postcode: 'LS1 1AA' }
    },
    accreditations: {
      2026: {
        accreditationNumber: 'ACC-50030-001',
        status: {
          current: 'approved',
          timeline: [{ at: '2026-01-01T00:00:00.000Z', status: 'approved' }]
        }
      }
    }
  }

  const mockExporterRegistration = {
    material: 'glass',
    status: { current: 'approved' },
    validFrom: '2026-01-01',
    wasteProcessingType: 'exporter',
    overseasSites: {},
    accreditations: mockRegistration.accreditations
  }

  const mockWasteBalance = {
    amount: 1500,
    availableAmount: 1200
  }

  const mockWasteBalanceWithDecember = {
    amount: 1500,
    availableAmount: 1200,
    decemberAmount: 300,
    decemberAvailableAmount: 250
  }

  const mockWasteBalanceEmptyDecember = {
    amount: 1500,
    availableAmount: 1200,
    decemberAmount: 0,
    decemberAvailableAmount: 0
  }

  /**
   * @param {object} registration
   * @param {string} [number]
   */
  const organisationHolding = (registration, number = registrationNumber) => ({
    name: 'ACME ltd',
    displayName: 'ACME',
    organisationNumber,
    status: { current: 'approved' },
    submittedToRegulator: { code: 'ea' },
    registrations: { [number]: registration }
  })

  const mockOrganisation = organisationHolding(mockRegistration)

  const calendarUrl = `${backendUrl}/organisations/:organisationNumber/registrations/:registrationNumber/reports/:year/calendar`
  const summaryLogsUrl = `${backendUrl}/organisations/:organisationNumber/registrations/:registrationNumber/summary-logs`
  const wasteBalanceUrl = `${backendUrl}/organisations/:organisationNumber/registrations/:registrationNumber/accreditations/:year/waste-balance`

  /**
   * Serves one kind's periods as the year calendar does, each stamped with its
   * cadence.
   * @param {{ cadence: string, reportingPeriods: object[] }} calendar
   */
  const asYearCalendar = ({ cadence, reportingPeriods }) => {
    const periods = reportingPeriods.map((period) => ({ ...period, cadence }))
    return {
      year: 2026,
      ...(cadence === 'monthly'
        ? {
            accredited: {
              accreditationNumber: 'ACC-1',
              reportingPeriods: periods
            }
          }
        : { registeredOnly: { reportingPeriods: periods } })
    }
  }

  const mockCalendar = {
    cadence: 'monthly',
    reportingPeriods: [
      {
        year: 2026,
        period: 1,
        submissionNumber: 1,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        dueDate: '2026-02-20',
        periodStatus: 'ready_to_submit',
        report: {
          id: 'b41148de-8a76-4214-b68d-4b786400fb90',
          status: 'ready_to_submit',
          submissionNumber: 1
        }
      },
      {
        year: 2026,
        period: 2,
        submissionNumber: 1,
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        dueDate: '2026-03-20',
        periodStatus: 'due',
        report: null
      }
    ]
  }

  const mockCalendarWithSubmittedReport = {
    cadence: 'monthly',
    reportingPeriods: [
      {
        year: 2026,
        period: 1,
        submissionNumber: 1,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        dueDate: '2026-02-20',
        periodStatus: 'submitted',
        report: {
          id: 'b41148de-8a76-4214-b68d-4b786400fb90',
          status: 'submitted',
          submissionNumber: 1
        }
      }
    ]
  }

  const mockCalendarWithHistory = {
    cadence: 'monthly',
    reportingPeriods: [
      {
        year: 2026,
        period: 1,
        submissionNumber: 1,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        dueDate: '2026-02-20',
        periodStatus: 'submitted',
        report: {
          id: 'b41148de-8a76-4214-b68d-4b786400fb90',
          status: 'submitted',
          submissionNumber: 1,
          submittedAt: '2026-02-10T09:00:00.000Z',
          submittedBy: 'Alice Regulator'
        }
      },
      {
        year: 2026,
        period: 1,
        submissionNumber: 2,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        dueDate: '2026-02-20',
        periodStatus: 'submitted',
        report: {
          id: 'c52259ef-9b87-4325-c79e-5c897511gc01',
          status: 'submitted',
          submissionNumber: 2,
          submittedAt: '2026-03-05T09:00:00.000Z',
          submittedBy: 'Bob Regulator'
        }
      }
    ]
  }

  const mockCalendarWithSkeleton = {
    cadence: 'monthly',
    reportingPeriods: [
      {
        year: 2026,
        period: 1,
        submissionNumber: 1,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        dueDate: '2026-02-20',
        periodStatus: 'submitted',
        report: {
          id: 'b41148de-8a76-4214-b68d-4b786400fb90',
          status: 'submitted',
          submissionNumber: 1,
          submittedAt: '2026-02-10T09:00:00.000Z',
          submittedBy: 'Alice Regulator'
        }
      },
      {
        year: 2026,
        period: 1,
        submissionNumber: 2,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        dueDate: '2026-02-20',
        periodStatus: 'requires_resubmission',
        report: null
      }
    ]
  }

  const mockCalendarWithResubmissionDraft = {
    cadence: 'monthly',
    reportingPeriods: [
      mockCalendarWithSkeleton.reportingPeriods[0],
      {
        ...mockCalendarWithSkeleton.reportingPeriods[1],
        report: {
          id: 'd63360fa-0c98-4436-d80f-6d908622hd12',
          status: 'in_progress',
          submissionNumber: 2,
          submittedAt: null,
          submittedBy: null
        }
      }
    ]
  }

  const mockCalendarNotYetEnded = {
    cadence: 'monthly',
    reportingPeriods: [
      {
        year: 2026,
        period: 1,
        submissionNumber: 1,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        dueDate: '2026-02-20',
        periodStatus: null,
        report: null
      }
    ]
  }

  const mockSubmittedSummaryLog = {
    summaryLogId: 'sl-submitted',
    filename: 'jan.xlsx',
    uploadedAt: '2026-01-01T11:00:00.000Z',
    status: 'submitted',
    year: 2026
  }

  const mockValidationFailedSummaryLog = {
    summaryLogId: 'sl-validation-failed',
    filename: 'feb.xlsx',
    uploadedAt: '2026-01-04T11:00:00.000Z',
    status: 'validation_failed',
    year: 2026
  }

  const renderPage = (html) => {
    const window = new Window()
    window.document.body.innerHTML = html
    return /** @type {HTMLElement} */ (
      /** @type {unknown} */ (window.document.body)
    )
  }

  const getReportsTable = (container) =>
    getByRole(container, 'table', { name: 'Reports' })

  const getSummaryLogsTable = (container) =>
    getByRole(container, 'table', { name: 'Summary logs' })

  const getDataRows = (table) => getAllByRole(table, 'row').slice(1)

  const getSummaryRow = (container, label) => {
    const term = getByText(container, label, { selector: 'dt' })
    return /** @type {HTMLElement} */ (term.closest('.govuk-summary-list__row'))
  }

  const getSummaryRowValue = (container, label) => {
    const row = getSummaryRow(container, label)
    // A row with actions renders a second `<dd>` (the actions cell), which
    // also has the implicit ARIA role "definition" — so `getByRole` alone is
    // ambiguous. Scope to the value cell specifically.
    return /** @type {HTMLElement} */ (
      row.querySelector('.govuk-summary-list__value')
    )
  }

  const useMockBackend = (
    organisationResponse = mockOrganisation,
    calendarResponse = mockCalendar,
    summaryLogsResponse = {
      summaryLogs: /** @type {Array<typeof mockSubmittedSummaryLog>} */ ([])
    },
    wasteBalanceResponse = mockWasteBalance
  ) => {
    mswServer.use(
      http.get(organisationViewUrl, () =>
        HttpResponse.json(organisationResponse)
      ),
      http.get(calendarUrl, () =>
        HttpResponse.json(asYearCalendar(calendarResponse))
      ),
      http.get(summaryLogsUrl, () => HttpResponse.json(summaryLogsResponse)),
      http.get(wasteBalanceUrl, () => HttpResponse.json(wasteBalanceResponse))
    )
  }

  describe('When user is unauthenticated', () => {
    test('Should return unauthorised status code', async () => {
      const { statusCode } = await server.inject({ method: 'GET', url })

      expect(statusCode).toBe(statusCodes.unauthorised)
    })
  })

  describe('When user is authenticated', () => {
    beforeAll(() => {
      vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
    })

    test('Should return OK', async () => {
      useMockBackend()

      const { statusCode } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      expect(statusCode).toBe(statusCodes.ok)
    })

    test('Should render the company name and registration number as heading', async () => {
      useMockBackend()

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)

      expect(getByRole(body, 'heading', { level: 1 })).toHaveTextContent(
        'ACME ltd - REG-50030-001'
      )
    })

    test('Should render summary list with processing type, material and site, leaving the registration status to the overviews', async () => {
      useMockBackend()

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)

      expect(queryByText(body, 'Status', { selector: 'dt' })).toBeNull()
      expect(getSummaryRowValue(body, 'Processing type')).toHaveTextContent(
        'reprocessor - input'
      )
      expect(getSummaryRowValue(body, 'Material')).toHaveTextContent('glass')
      expect(getSummaryRowValue(body, 'Site')).toHaveTextContent('Site A')
    })

    test('Should not offer status changes, which are on the JSON editor page', async () => {
      useMockBackend()

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)

      expect(
        getSummaryRow(body, 'Accreditation status').querySelector(
          '.govuk-summary-list__actions'
        )
      ).toBeNull()
    })

    test('Should render accreditation rows in summary list when accreditation exists', async () => {
      useMockBackend()

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)

      expect(
        getSummaryRowValue(body, 'Accreditation number')
      ).toHaveTextContent('ACC-50030-001')
      expect(
        within(getSummaryRowValue(body, 'Accreditation status')).getByText(
          'approved'
        )
      ).toHaveClass('govuk-tag')
    })

    test('Should render a waste balance events link when accreditation exists', async () => {
      useMockBackend()

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)
      const eventsValue = getSummaryRowValue(body, 'Waste balance events')
      const link = within(eventsValue).getByRole('link', {
        name: 'View'
      })

      expect(link).toHaveAttribute(
        'href',
        `/organisations/500123/registrations/REG-50030-001/accreditations/2026/waste-balance-events`
      )
    })

    test('Should render an overseas sites link for an exporter accreditation', async () => {
      useMockBackend(organisationHolding(mockExporterRegistration))

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)
      const sitesValue = getSummaryRowValue(body, 'Overseas sites')
      const link = within(sitesValue).getByRole('link', {
        name: 'View'
      })

      expect(link).toHaveAttribute(
        'href',
        `/organisations/500123/registrations/REG-50030-001/accreditations/2026/overseas-sites`
      )
    })

    test('Should not render an overseas sites link for a reprocessor accreditation', async () => {
      useMockBackend()

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)

      expect(queryByText(body, 'Overseas sites', { selector: 'dt' })).toBeNull()
    })

    test('Should render a PRN activity download link when accreditation exists', async () => {
      useMockBackend()

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)
      const value = getSummaryRowValue(body, 'PRN activity')
      const link = within(value).getByRole('link', { name: 'Download' })

      expect(link).toHaveAttribute(
        'href',
        '/organisations/500123/registrations/REG-50030-001/accreditations/2026/prn-activity/download'
      )
    })

    test('Should keep a registration number holding slashes as one segment of its links and backend paths', async () => {
      /** @type {string[]} */
      const summaryLogPaths = []
      useMockBackend(
        organisationHolding(mockRegistration, 'FAKE/REG500123/ALPHA')
      )
      mswServer.use(
        http.get(summaryLogsUrl, ({ request }) => {
          summaryLogPaths.push(new URL(request.url).pathname)
          return HttpResponse.json({ summaryLogs: [] })
        })
      )

      const { statusCode, result } = await server.inject({
        method: 'GET',
        url: '/organisations/500123/registrations/FAKE%2FREG500123%2FALPHA/accreditations/2026',
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      expect(statusCode).toBe(statusCodes.ok)
      const body = renderPage(result)
      expect(
        within(getSummaryRowValue(body, 'Waste balance events')).getByRole(
          'link',
          { name: 'View' }
        )
      ).toHaveAttribute(
        'href',
        '/organisations/500123/registrations/FAKE%2FREG500123%2FALPHA/accreditations/2026/waste-balance-events'
      )
      expect(summaryLogPaths).toStrictEqual([
        '/organisations/500123/registrations/FAKE%2FREG500123%2FALPHA/summary-logs'
      ])
    })

    test('Should render the reporting periods table', async () => {
      useMockBackend()

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)
      const reportsTable = getReportsTable(body)

      expect(
        getAllByRole(reportsTable, 'columnheader').map((h) =>
          h.textContent?.trim()
        )
      ).toEqual(['Period', 'Submission', 'Due', 'Status', 'Actions'])

      const [firstRow, secondRow] = getDataRows(reportsTable)

      expect(within(firstRow).getByText('January')).toBeInTheDocument()
      expect(within(firstRow).getByText('2026-02-20')).toBeInTheDocument()
      expect(within(firstRow).getByText('Ready to submit')).toHaveClass(
        'govuk-tag'
      )
      expect(
        within(firstRow).getByRole('link', { name: 'View' })
      ).toHaveAttribute(
        'href',
        `/organisations/500123/registrations/REG-50030-001/accreditations/2026/reports/monthly/1/submissions/1`
      )

      expect(within(secondRow).getByText('Due')).toHaveClass('govuk-tag')
      expect(within(secondRow).queryByRole('link')).toBeNull()
    })

    test('Should link a registered-only report under the registration', async () => {
      useMockBackend()
      mswServer.use(
        http.get(calendarUrl, () =>
          HttpResponse.json(
            asYearCalendar({ ...mockCalendar, cadence: 'quarterly' })
          )
        )
      )

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const [firstRow] = getDataRows(getReportsTable(renderPage(result)))

      expect(
        within(firstRow).getByRole('link', { name: 'View' })
      ).toHaveAttribute(
        'href',
        '/organisations/500123/registrations/REG-50030-001/reports/2026/quarterly/1/submissions/1'
      )
    })

    test('Should list registered-only and accredited reports together, each linked and superseded by its own cadence', async () => {
      useMockBackend()
      mswServer.use(
        http.get(calendarUrl, () =>
          HttpResponse.json({
            year: 2026,
            registeredOnly: {
              reportingPeriods: [
                {
                  ...mockCalendarWithSubmittedReport.reportingPeriods[0],
                  cadence: 'quarterly',
                  endDate: '2026-03-31',
                  submissionNumber: 2,
                  report: {
                    ...mockCalendarWithSubmittedReport.reportingPeriods[0]
                      .report,
                    submissionNumber: 2
                  }
                }
              ]
            },
            accredited: {
              accreditationNumber: 'ACC-1',
              reportingPeriods: [
                {
                  ...mockCalendarWithSubmittedReport.reportingPeriods[0],
                  cadence: 'monthly'
                }
              ]
            }
          })
        )
      )

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const rows = getDataRows(getReportsTable(renderPage(result)))

      expect(
        rows.map((row) =>
          within(row).getByRole('link', { name: 'View' }).getAttribute('href')
        )
      ).toStrictEqual([
        '/organisations/500123/registrations/REG-50030-001/reports/2026/quarterly/1/submissions/2',
        '/organisations/500123/registrations/REG-50030-001/accreditations/2026/reports/monthly/1/submissions/1'
      ])
      expect(
        rows.map((row) => within(row).queryByRole('link', { name: /Unsubmit/ }))
      ).toStrictEqual([expect.anything(), expect.anything()])
    })

    test("Should request the current year's reports calendar by number with the expand=submissions arg", async () => {
      /** @type {URL | undefined} */
      let calendarRequestUrl
      useMockBackend()
      mswServer.use(
        http.get(calendarUrl, ({ request }) => {
          calendarRequestUrl = new URL(request.url)
          return HttpResponse.json(asYearCalendar(mockCalendar))
        })
      )

      await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      expect(calendarRequestUrl?.pathname).toBe(
        `/organisations/500123/registrations/REG-50030-001/reports/${new Date().getUTCFullYear()}/calendar`
      )
      expect(calendarRequestUrl?.searchParams.get('expand')).toBe('submissions')
    })

    test('Should not render the reports table when the backend serves no calendar for the registration', async () => {
      useMockBackend()
      mswServer.use(
        http.get(calendarUrl, () =>
          HttpResponse.json({}, { status: statusCodes.notFound })
        )
      )

      const { statusCode, result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      expect(statusCode).toBe(statusCodes.ok)
      expect(
        queryByRole(renderPage(result), 'table', { name: 'Reports' })
      ).toBeNull()
    })

    test('Should show 500 error page when the reports calendar backend returns a non-OK response', async () => {
      useMockBackend()
      mswServer.use(
        http.get(calendarUrl, () => {
          throw HttpResponse.text('', { status: 500 })
        })
      )

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      expect(
        getByText(
          renderPage(result),
          'Sorry, there is a problem with the service'
        )
      ).toBeInTheDocument()
    })

    test('Should render every submission for a period as its own reachable row', async () => {
      useMockBackend()
      mswServer.use(
        http.get(calendarUrl, () =>
          HttpResponse.json(asYearCalendar(mockCalendarWithHistory))
        )
      )

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)
      const dataRows = getDataRows(getReportsTable(body))

      expect(dataRows).toHaveLength(2)
      expect(getAllByRole(dataRows[0], 'cell')[1]).toHaveTextContent('1')
      expect(getAllByRole(dataRows[1], 'cell')[1]).toHaveTextContent('2')
      expect(
        within(dataRows[0]).getByRole('link', { name: 'View' })
      ).toHaveAttribute(
        'href',
        `/organisations/500123/registrations/REG-50030-001/accreditations/2026/reports/monthly/1/submissions/1`
      )
      expect(
        within(dataRows[1]).getByRole('link', { name: 'View' })
      ).toHaveAttribute(
        'href',
        `/organisations/500123/registrations/REG-50030-001/accreditations/2026/reports/monthly/1/submissions/2`
      )
    })

    test('Should show requires_resubmission status for a skeleton resubmission row', async () => {
      useMockBackend()
      mswServer.use(
        http.get(calendarUrl, () =>
          HttpResponse.json(asYearCalendar(mockCalendarWithSkeleton))
        )
      )

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)
      const [submittedRow, skeletonRow] = getDataRows(getReportsTable(body))

      expect(getAllByRole(submittedRow, 'cell')[1]).toHaveTextContent('1')
      expect(getAllByRole(skeletonRow, 'cell')[1].textContent?.trim()).toBe('')
      expect(
        within(skeletonRow).getByText('Requires resubmission')
      ).toHaveClass('govuk-tag', 'app-status-tag')
    })

    it('should keep the requires-resubmission status once the draft is in flight', async () => {
      useMockBackend(mockOrganisation, mockCalendarWithResubmissionDraft)

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)
      const [submittedRow, draftRow] = getDataRows(getReportsTable(body))

      expect(within(submittedRow).getByText('Submitted')).toBeInTheDocument()
      expect(getAllByRole(submittedRow, 'cell')[1]).toHaveTextContent('1')
      expect(within(draftRow).getByText('Requires resubmission')).toHaveClass(
        'govuk-tag',
        'app-status-tag'
      )
      expect(getAllByRole(draftRow, 'cell')[1]).toHaveTextContent('2')
      expect(
        within(draftRow).getByRole('link', { name: 'View' })
      ).toBeInTheDocument()
    })

    it('should fall back to the raw status when it has no label', async () => {
      useMockBackend()
      mswServer.use(
        http.get(calendarUrl, () =>
          HttpResponse.json(
            asYearCalendar({
              cadence: 'monthly',
              reportingPeriods: [
                {
                  ...mockCalendarNotYetEnded.reportingPeriods[0],
                  periodStatus: 'awaiting_the_unknown'
                }
              ]
            })
          )
        )
      )

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)
      const [onlyRow] = getDataRows(getReportsTable(body))

      expect(within(onlyRow).getByText('awaiting_the_unknown')).toHaveClass(
        'govuk-tag'
      )
    })

    test('Should render a blank status cell when periodStatus is null and there is no report', async () => {
      useMockBackend()
      mswServer.use(
        http.get(calendarUrl, () =>
          HttpResponse.json(asYearCalendar(mockCalendarNotYetEnded))
        )
      )

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)
      const [onlyRow] = getDataRows(getReportsTable(body))
      const statusCell = getAllByRole(onlyRow, 'cell')[3]

      expect(getAllByRole(onlyRow, 'cell')[1].textContent?.trim()).toBe('')
      expect(statusCell.querySelector('.govuk-tag')).toBeNull()
      expect(statusCell.textContent?.trim()).toBe('')
    })

    test('Should render the Summary logs table with column headers when summary logs exist', async () => {
      useMockBackend(mockOrganisation, mockCalendar, {
        summaryLogs: [mockSubmittedSummaryLog]
      })

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)

      expect(
        getAllByRole(getSummaryLogsTable(body), 'columnheader').map((h) =>
          h.textContent?.trim()
        )
      ).toEqual(['Uploaded at', 'Status', 'Actions'])
    })

    test('Should render a green Success tag and Download link for a submitted log', async () => {
      useMockBackend(mockOrganisation, mockCalendar, {
        summaryLogs: [mockSubmittedSummaryLog]
      })

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)
      const [firstRow] = getDataRows(getSummaryLogsTable(body))

      expect(
        within(firstRow).getByText('2026-01-01T11:00:00.000Z')
      ).toBeInTheDocument()
      expect(within(firstRow).getByText('Success')).toHaveClass(
        'govuk-tag',
        'govuk-tag--green'
      )
      expect(
        within(firstRow).getByRole('link', { name: 'Download' })
      ).toHaveAttribute(
        'href',
        `/organisations/500123/registrations/REG-50030-001/summary-logs/${mockSubmittedSummaryLog.summaryLogId}/file`
      )
    })

    test('Should render a View data link to the summary log document page', async () => {
      useMockBackend(mockOrganisation, mockCalendar, {
        summaryLogs: [mockSubmittedSummaryLog]
      })

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)
      const [firstRow] = getDataRows(getSummaryLogsTable(body))

      expect(
        within(firstRow).getByRole('link', { name: 'View data' })
      ).toHaveAttribute(
        'href',
        `/organisations/500123/registrations/REG-50030-001/summary-logs/${mockSubmittedSummaryLog.summaryLogId}`
      )
    })

    test.each([
      ['rejected', 'Failed (Rejected)'],
      ['invalid', 'Failed (Invalid)'],
      ['validation_failed', 'Failed (Validation)'],
      ['submission_failed', 'Failed (Submission)']
    ])(
      'Should render a red "%s" tag labelled "%s"',
      async (status, expectedLabel) => {
        useMockBackend(mockOrganisation, mockCalendar, {
          summaryLogs: [{ ...mockValidationFailedSummaryLog, status }]
        })

        const { result } = await server.inject({
          method: 'GET',
          url,
          auth: { strategy: 'session', credentials: mockUserSession }
        })

        const body = renderPage(result)
        const firstRow = getDataRows(getSummaryLogsTable(body))[0]
        const tag = within(firstRow).getByText(expectedLabel)

        expect(tag).toHaveClass('govuk-tag', 'govuk-tag--red')
      }
    )

    test('Should render multiple summary-log rows newest-first', async () => {
      useMockBackend(mockOrganisation, mockCalendar, {
        summaryLogs: [mockSubmittedSummaryLog, mockValidationFailedSummaryLog]
      })

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)
      const dataRows = getDataRows(getSummaryLogsTable(body))

      expect(dataRows).toHaveLength(2)
      expect(
        within(dataRows[0]).getByText('2026-01-01T11:00:00.000Z')
      ).toBeInTheDocument()
      expect(
        within(dataRows[1]).getByText('2026-01-04T11:00:00.000Z')
      ).toBeInTheDocument()
    })

    test('Should render "No summary logs" when the summary-logs list is empty', async () => {
      useMockBackend()

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)

      expect(queryByRole(body, 'table', { name: 'Summary logs' })).toBeNull()
      expect(getByText(body, 'No summary logs')).toBeInTheDocument()
    })

    test('Should show 500 error page when the summary-logs backend returns a non-OK response', async () => {
      mswServer.use(
        http.get(organisationViewUrl, () =>
          HttpResponse.json(mockOrganisation)
        ),
        http.get(calendarUrl, () =>
          HttpResponse.json(asYearCalendar(mockCalendar))
        ),
        http.get(wasteBalanceUrl, () => HttpResponse.json(mockWasteBalance)),
        http.get(summaryLogsUrl, () => {
          throw HttpResponse.text('', { status: 500 })
        })
      )

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)

      expect(
        getByText(body, 'Sorry, there is a problem with the service')
      ).toBeInTheDocument()
    })

    test('Should show the not found page for a registration number the organisation does not hold', async () => {
      useMockBackend(organisationHolding(mockRegistration, 'REG-50030-999'))

      const { statusCode, result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      expect(statusCode).toBe(statusCodes.notFound)
      expect(
        getByText(renderPage(result), 'Page not found')
      ).toBeInTheDocument()
    })

    test('Should show the not found page for an organisation number the backend does not find', async () => {
      useMockBackend()
      mswServer.use(
        http.get(organisationViewUrl, () =>
          HttpResponse.json({}, { status: statusCodes.notFound })
        )
      )

      const { statusCode, result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      expect(statusCode).toBe(statusCodes.notFound)
      expect(
        getByText(renderPage(result), 'Page not found')
      ).toBeInTheDocument()
    })

    test('Should show 500 error page when backend returns a non-OK response', async () => {
      mswServer.use(
        http.get(organisationViewUrl, () => {
          throw HttpResponse.text('', { status: 500 })
        }),
        http.get(summaryLogsUrl, () => HttpResponse.json({ summaryLogs: [] }))
      )

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)

      expect(
        getByText(body, 'Sorry, there is a problem with the service')
      ).toBeInTheDocument()
    })

    describe('Waste balance section', () => {
      test('Should render waste balance rows in summary list when accredited', async () => {
        useMockBackend()

        const { result } = await server.inject({
          method: 'GET',
          url,
          auth: { strategy: 'session', credentials: mockUserSession }
        })

        const body = renderPage(result)

        expect(
          getSummaryRowValue(body, 'Waste balance (tonnes)')
        ).toHaveTextContent('1500')
        expect(
          getSummaryRowValue(body, 'Waste balance available (tonnes)')
        ).toHaveTextContent('1200')
      })

      test('Should still render the page with "No data" in waste balance rows when the waste balance endpoint errors', async () => {
        mswServer.use(
          http.get(organisationViewUrl, () =>
            HttpResponse.json(mockOrganisation)
          ),
          http.get(calendarUrl, () =>
            HttpResponse.json(asYearCalendar(mockCalendar))
          ),
          http.get(summaryLogsUrl, () =>
            HttpResponse.json({ summaryLogs: [] })
          ),
          http.get(wasteBalanceUrl, () => {
            throw HttpResponse.text('', { status: 500 })
          })
        )

        const { statusCode, result } = await server.inject({
          method: 'GET',
          url,
          auth: { strategy: 'session', credentials: mockUserSession }
        })

        expect(statusCode).toBe(statusCodes.ok)

        const body = renderPage(result)

        expect(
          getSummaryRowValue(body, 'Waste balance (tonnes)')
        ).toHaveTextContent('No data')
        expect(
          getSummaryRowValue(body, 'Waste balance available (tonnes)')
        ).toHaveTextContent('No data')
      })

      test('Should render "No data" in waste balance rows when the backend does not serve the accreditation', async () => {
        useMockBackend()
        mswServer.use(
          http.get(wasteBalanceUrl, () =>
            HttpResponse.json({}, { status: statusCodes.notFound })
          )
        )

        const { statusCode, result } = await server.inject({
          method: 'GET',
          url,
          auth: { strategy: 'session', credentials: mockUserSession }
        })

        expect(statusCode).toBe(statusCodes.ok)

        const body = renderPage(result)

        expect(
          getSummaryRowValue(body, 'Waste balance (tonnes)')
        ).toHaveTextContent('No data')
        expect(
          getSummaryRowValue(body, 'Waste balance available (tonnes)')
        ).toHaveTextContent('No data')
      })

      test('Should render December waste balance rows when the balance carries a December portion', async () => {
        useMockBackend(
          mockOrganisation,
          mockCalendar,
          { summaryLogs: [] },
          mockWasteBalanceWithDecember
        )

        const { result } = await server.inject({
          method: 'GET',
          url,
          auth: { strategy: 'session', credentials: mockUserSession }
        })

        const body = renderPage(result)

        expect(
          getSummaryRowValue(body, 'December waste balance (tonnes)')
        ).toHaveTextContent('300')
        expect(
          getSummaryRowValue(body, 'December waste balance available (tonnes)')
        ).toHaveTextContent('250')
      })

      test('Should render a materialised zero December balance rather than hiding the rows', async () => {
        useMockBackend(
          mockOrganisation,
          mockCalendar,
          { summaryLogs: [] },
          mockWasteBalanceEmptyDecember
        )

        const { result } = await server.inject({
          method: 'GET',
          url,
          auth: { strategy: 'session', credentials: mockUserSession }
        })

        const body = renderPage(result)

        expect(
          getSummaryRowValue(body, 'December waste balance (tonnes)')
        ).toHaveTextContent('0')
        expect(
          getSummaryRowValue(body, 'December waste balance available (tonnes)')
        ).toHaveTextContent('0')
      })

      test('Should not render December waste balance rows when the balance has no December portion', async () => {
        useMockBackend()

        const { result } = await server.inject({
          method: 'GET',
          url,
          auth: { strategy: 'session', credentials: mockUserSession }
        })

        const body = renderPage(result)

        expect(
          queryByText(body, 'December waste balance (tonnes)', {
            selector: 'dt'
          })
        ).toBeNull()
        expect(
          queryByText(body, 'December waste balance available (tonnes)', {
            selector: 'dt'
          })
        ).toBeNull()
      })

      test('Should not render December waste balance rows when the waste balance endpoint errors', async () => {
        useMockBackend()
        mswServer.use(
          http.get(wasteBalanceUrl, () => {
            throw HttpResponse.text('', { status: 500 })
          })
        )

        const { result } = await server.inject({
          method: 'GET',
          url,
          auth: { strategy: 'session', credentials: mockUserSession }
        })

        const body = renderPage(result)

        expect(
          queryByText(body, 'December waste balance (tonnes)', {
            selector: 'dt'
          })
        ).toBeNull()
        expect(
          queryByText(body, 'December waste balance available (tonnes)', {
            selector: 'dt'
          })
        ).toBeNull()
      })
    })

    describe('Unsubmit link visibility', () => {
      afterEach(() => {
        vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
      })

      test('Should render the Unsubmit link for a submitted report when the user has admin.write scope', async () => {
        useMockBackend(mockOrganisation, mockCalendarWithSubmittedReport)

        const { result } = await server.inject({
          method: 'GET',
          url,
          auth: { strategy: 'session', credentials: mockUserSession }
        })

        const body = renderPage(result)
        const unsubmitLink = within(getReportsTable(body)).getByRole('link', {
          name: 'Unsubmit'
        })

        expect(unsubmitLink).toHaveAttribute(
          'href',
          `/organisations/500123/registrations/REG-50030-001/accreditations/2026/reports/monthly/1/submissions/1/unsubmit/confirm`
        )
      })

      test('Should not render the Unsubmit link when the user lacks admin.write scope', async () => {
        const readOnlySession = {
          ...mockUserSession,
          scopes: ['admin.read']
        }
        vi.mocked(getUserSession).mockResolvedValue(readOnlySession)
        useMockBackend(mockOrganisation, mockCalendarWithSubmittedReport)

        const { result } = await server.inject({
          method: 'GET',
          url,
          auth: { strategy: 'session', credentials: readOnlySession }
        })

        const body = renderPage(result)

        expect(
          within(getReportsTable(body)).queryByRole('link', {
            name: 'Unsubmit'
          })
        ).toBeNull()
      })

      test('Should render the Unsubmit link only on the current submission, not a superseded one', async () => {
        useMockBackend(mockOrganisation, mockCalendarWithHistory)

        const { result } = await server.inject({
          method: 'GET',
          url,
          auth: { strategy: 'session', credentials: mockUserSession }
        })

        const body = renderPage(result)
        const [supersededRow, currentRow] = getDataRows(getReportsTable(body))

        expect(
          within(supersededRow).queryByRole('link', { name: 'Unsubmit' })
        ).toBeNull()
        expect(
          within(currentRow).getByRole('link', { name: 'Unsubmit' })
        ).toHaveAttribute(
          'href',
          `/organisations/500123/registrations/REG-50030-001/accreditations/2026/reports/monthly/1/submissions/2/unsubmit/confirm`
        )
      })

      it.each([
        {
          state: 'before the resubmission draft exists',
          calendar: mockCalendarWithSkeleton
        },
        {
          state: 'while the resubmission draft is in flight',
          calendar: mockCalendarWithResubmissionDraft
        }
      ])(
        'should not render the Unsubmit link on a report flagged for resubmission, $state',
        async ({ calendar }) => {
          useMockBackend(mockOrganisation, calendar)

          const { result } = await server.inject({
            method: 'GET',
            url,
            auth: { strategy: 'session', credentials: mockUserSession }
          })

          const body = renderPage(result)

          expect(
            within(getReportsTable(body)).queryByRole('link', {
              name: 'Unsubmit'
            })
          ).toBeNull()
        }
      )
    })
  })
})
