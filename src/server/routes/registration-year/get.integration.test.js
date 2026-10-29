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
  queryByText
} from '@testing-library/dom'
import { Window } from 'happy-dom'
import { vi } from 'vitest'

vi.mock('#server/common/helpers/auth/get-user-session.js', () => ({
  getUserSession: vi.fn().mockReturnValue(null)
}))

describe('#registrationYearController', () => {
  const originalBackendUrl = config.get('eprBackendUrl')
  const backendUrl = 'http://mock-backend'
  const organisationNumber = '500123'
  const registrationNumber = 'REG-50030-001'
  const registrationUrl = `/organisations/${organisationNumber}/registrations/${registrationNumber}`
  const accreditedUrl = (year) => `${registrationUrl}/accreditations/${year}`
  const registeredOnlyUrl = (year) =>
    `${registrationUrl}/registered-only/${year}`
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

  const reprocessor = {
    material: 'glass',
    status: {
      current: 'approved',
      timeline: [{ at: '2024-01-01T00:00:00.000Z', status: 'approved' }]
    },
    validFrom: '2024-01-01',
    wasteProcessingType: 'reprocessor',
    reprocessingType: 'input',
    site: {
      address: { line1: 'Site A', town: 'Leeds', postcode: 'LS1 1AA' }
    },
    accreditations: {
      2025: {
        accreditationNumber: 'ACC-2025',
        status: {
          current: 'suspended',
          timeline: [{ at: '2025-01-01T00:00:00.000Z', status: 'suspended' }]
        }
      },
      2026: {
        accreditationNumber: 'ACC-2026',
        status: {
          current: 'approved',
          timeline: [{ at: '2026-01-01T00:00:00.000Z', status: 'approved' }]
        }
      }
    }
  }

  const exporter = {
    material: 'glass',
    status: reprocessor.status,
    validFrom: '2024-01-01',
    wasteProcessingType: 'exporter',
    accreditations: reprocessor.accreditations
  }

  /** @param {object} registration */
  const organisationHolding = (registration) => ({
    name: 'ACME ltd',
    organisationNumber,
    registrations: { [registrationNumber]: registration }
  })

  /** @param {number} year */
  const calendarFor = (year) => ({
    year,
    registeredOnly: {
      reportingPeriods: [
        {
          year,
          cadence: 'quarterly',
          period: 4,
          submissionNumber: 1,
          startDate: `${year}-10-01`,
          endDate: `${year}-12-31`,
          dueDate: `${year + 1}-01-20`,
          periodStatus: 'submitted',
          report: { id: 'r1', status: 'submitted', submissionNumber: 1 }
        }
      ]
    }
  })

  const summaryLog = {
    summaryLogId: 'sl-1',
    filename: 'q4.xlsx',
    uploadedAt: '2025-12-01T11:00:00.000Z',
    status: 'submitted',
    year: 2025,
    accreditationNumber: 'ACC-2025'
  }

  /** @type {{ calendarYears: string[], summaryLogQueries: string[], wasteBalanceYears: string[] }} */
  let requested

  /** @param {object} [registration] */
  const useMockBackend = (registration = reprocessor) => {
    requested = {
      calendarYears: [],
      summaryLogQueries: [],
      wasteBalanceYears: []
    }
    mswServer.use(
      http.get(`${backendUrl}/organisations/${organisationNumber}`, () =>
        HttpResponse.json(organisationHolding(registration))
      ),
      http.get(
        `${backendUrl}/organisations/:o/registrations/:r/reports/:year/calendar`,
        ({ params }) => {
          requested.calendarYears.push(String(params.year))
          return HttpResponse.json(calendarFor(Number(params.year)))
        }
      ),
      http.get(
        `${backendUrl}/organisations/:o/registrations/:r/summary-logs`,
        ({ request }) => {
          requested.summaryLogQueries.push(new URL(request.url).search)
          return HttpResponse.json({ summaryLogs: [summaryLog] })
        }
      ),
      http.get(
        `${backendUrl}/organisations/:o/registrations/:r/accreditations/:year/waste-balance`,
        ({ params }) => {
          requested.wasteBalanceYears.push(String(params.year))
          return HttpResponse.json({ amount: 150, availableAmount: 120 })
        }
      )
    )
  }

  const renderPage = (html) => {
    const window = new Window()
    window.document.body.innerHTML = html
    return /** @type {HTMLElement} */ (
      /** @type {unknown} */ (window.document.body)
    )
  }

  const getSummaryRowValue = (container, label) =>
    /** @type {HTMLElement} */ (
      getByText(container, label, { selector: 'dt' })
        .closest('.govuk-summary-list__row')
        ?.querySelector('.govuk-summary-list__value')
    )

  const getDataRows = (container, name) =>
    getAllByRole(getByRole(container, 'table', { name }), 'row').slice(1)

  /** @param {string} url */
  const get = (url) =>
    server.inject({
      method: 'GET',
      url,
      auth: { strategy: 'session', credentials: mockUserSession }
    })

  test('Should return unauthorised when unauthenticated', async () => {
    const { statusCode } = await server.inject({
      method: 'GET',
      url: accreditedUrl(2026)
    })

    expect(statusCode).toBe(statusCodes.unauthorised)
  })

  describe('When user is authenticated', () => {
    beforeAll(() => {
      vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
    })

    describe('An accredited year', () => {
      test('Should render the year in the heading and breadcrumbs back to the registration', async () => {
        useMockBackend()

        const { statusCode, result } = await get(accreditedUrl(2025))
        const body = renderPage(result)

        expect(statusCode).toBe(statusCodes.ok)
        expect(getByRole(body, 'heading', { level: 1 })).toHaveTextContent(
          'ACME ltd - REG-50030-001 - 2025 accredited'
        )
        const breadcrumbs = getByRole(body, 'navigation', {
          name: 'Breadcrumb'
        })
        expect(
          getAllByRole(breadcrumbs, 'link').map((l) => l.getAttribute('href'))
        ).toEqual([
          '/organisations',
          `/organisations/${organisationNumber}/overview`,
          `${registrationUrl}/overview`
        ])
      })

      test("Should show the year's accreditation, not the latest", async () => {
        useMockBackend()

        const { result } = await get(accreditedUrl(2025))
        const body = renderPage(result)

        expect(
          getSummaryRowValue(body, 'Accreditation number')
        ).toHaveTextContent('ACC-2025')
        expect(
          getSummaryRowValue(body, 'Accreditation status')
        ).toHaveTextContent('suspended')
        expect(
          getSummaryRowValue(body, 'Waste balance (tonnes)')
        ).toHaveTextContent('150')
        expect(requested.wasteBalanceYears).toEqual(['2025'])
      })

      test("Should link to the year's waste balance events and PRN activity", async () => {
        useMockBackend()

        const { result } = await get(accreditedUrl(2025))
        const body = renderPage(result)

        expect(
          getByRole(getSummaryRowValue(body, 'Waste balance events'), 'link')
        ).toHaveAttribute(
          'href',
          `${registrationUrl}/accreditations/2025/waste-balance-events`
        )
        expect(
          getByRole(getSummaryRowValue(body, 'PRN activity'), 'link')
        ).toHaveAttribute(
          'href',
          `${registrationUrl}/accreditations/2025/prn-activity/download`
        )
        expect(
          queryByText(body, 'Overseas sites', { selector: 'dt' })
        ).toBeNull()
        expect(
          queryByText(body, 'Waste records', { selector: 'dt' })
        ).toBeNull()
      })

      test("Should link an exporter to the year's overseas sites", async () => {
        useMockBackend(exporter)

        const { result } = await get(accreditedUrl(2025))
        const body = renderPage(result)

        expect(
          getByRole(getSummaryRowValue(body, 'Overseas sites'), 'link')
        ).toHaveAttribute(
          'href',
          `${registrationUrl}/accreditations/2025/overseas-sites`
        )
      })

      test("Should list the year's reports and summary logs", async () => {
        useMockBackend()

        const { result } = await get(accreditedUrl(2025))
        const body = renderPage(result)

        expect(requested.calendarYears).toEqual(['2025'])
        expect(requested.summaryLogQueries).toEqual(['?year=2025'])
        expect(getDataRows(body, 'Reports')).toHaveLength(1)
        expect(getDataRows(body, 'Reports')[0]).toHaveTextContent('Submitted')
        expect(getDataRows(body, 'Summary logs')[0]).toHaveTextContent(
          '2025-12-01T11:00:00.000Z'
        )
      })

      test("Should leave out other years' summary logs when the backend returns them", async () => {
        useMockBackend()
        mswServer.use(
          http.get(
            `${backendUrl}/organisations/:o/registrations/:r/summary-logs`,
            () =>
              HttpResponse.json({
                summaryLogs: [
                  summaryLog,
                  {
                    ...summaryLog,
                    summaryLogId: 'sl-2024',
                    uploadedAt: '2024-06-01T09:00:00.000Z',
                    year: 2024,
                    accreditationNumber: null
                  }
                ]
              })
          )
        )

        const { result } = await get(accreditedUrl(2025))
        const rows = getDataRows(renderPage(result), 'Summary logs')

        expect(rows).toHaveLength(1)
        expect(rows[0]).toHaveTextContent('2025-12-01T11:00:00.000Z')
      })

      test('Should return not found for a year without an accreditation', async () => {
        useMockBackend()

        const { statusCode } = await get(accreditedUrl(2024))

        expect(statusCode).toBe(statusCodes.notFound)
      })
    })

    describe('A registered-only year', () => {
      test('Should render the year without accreditation details', async () => {
        useMockBackend()

        const { statusCode, result } = await get(registeredOnlyUrl(2024))
        const body = renderPage(result)

        expect(statusCode).toBe(statusCodes.ok)
        expect(getByRole(body, 'heading', { level: 1 })).toHaveTextContent(
          'ACME ltd - REG-50030-001 - 2024 registered only'
        )
        expect(getSummaryRowValue(body, 'Material')).toHaveTextContent('glass')
        expect(
          queryByText(body, 'Accreditation number', { selector: 'dt' })
        ).toBeNull()
        expect(queryByText(body, 'PRN activity', { selector: 'dt' })).toBeNull()
        expect(requested.wasteBalanceYears).toEqual([])
      })

      test("Should show the registration's current status", async () => {
        useMockBackend({
          ...reprocessor,
          status: {
            current: 'cancelled',
            timeline: [
              { at: '2024-01-01T00:00:00.000Z', status: 'approved' },
              { at: '2025-03-01T00:00:00.000Z', status: 'cancelled' }
            ]
          },
          accreditations: {}
        })

        const { result } = await get(registeredOnlyUrl(2024))
        const body = renderPage(result)

        expect(getSummaryRowValue(body, 'Status')).toHaveTextContent(
          'cancelled'
        )
      })

      test('Should return not found for a year after the registration was cancelled', async () => {
        useMockBackend({
          ...reprocessor,
          status: {
            current: 'cancelled',
            timeline: [
              { at: '2024-01-01T00:00:00.000Z', status: 'approved' },
              { at: '2025-03-01T00:00:00.000Z', status: 'cancelled' }
            ]
          },
          accreditations: {}
        })

        const { statusCode } = await get(registeredOnlyUrl(2026))

        expect(statusCode).toBe(statusCodes.notFound)
      })

      test("Should list the year's reports and summary logs", async () => {
        useMockBackend()

        const { result } = await get(registeredOnlyUrl(2024))
        const body = renderPage(result)

        expect(requested.calendarYears).toEqual(['2024'])
        expect(requested.summaryLogQueries).toEqual(['?year=2024'])
        expect(getDataRows(body, 'Reports')[0]).toHaveTextContent('Quarter 4')
      })

      test('Should return not found for an accredited year', async () => {
        useMockBackend()

        const { statusCode } = await get(registeredOnlyUrl(2026))

        expect(statusCode).toBe(statusCodes.notFound)
      })

      test('Should return not found for a year the registration was not approved in', async () => {
        useMockBackend()

        const { statusCode } = await get(registeredOnlyUrl(2023))

        expect(statusCode).toBe(statusCodes.notFound)
      })
    })

    describe.each(['created', 'rejected'])(
      'A year whose accreditation is %s',
      (status) => {
        const neverHeld = {
          ...reprocessor,
          accreditations: {
            2024: {
              accreditationNumber: 'ACC-2024',
              status: {
                current: status,
                timeline: [{ at: '2024-01-01T00:00:00.000Z', status }]
              }
            }
          }
        }

        test('Should render as registered only', async () => {
          useMockBackend(neverHeld)

          const { statusCode, result } = await get(registeredOnlyUrl(2024))
          const body = renderPage(result)

          expect(statusCode).toBe(statusCodes.ok)
          expect(getByRole(body, 'heading', { level: 1 })).toHaveTextContent(
            'ACME ltd - REG-50030-001 - 2024 registered only'
          )
        })

        test('Should return not found as an accredited year', async () => {
          useMockBackend(neverHeld)

          const { statusCode } = await get(accreditedUrl(2024))

          expect(statusCode).toBe(statusCodes.notFound)
        })
      }
    )

    test.each([
      ['2025', `${registrationUrl}/accreditations/2025`],
      ['2024', `${registrationUrl}/registered-only/2024`]
    ])('Should send year %s on to its page', async (year, location) => {
      useMockBackend()

      const { statusCode, headers } = await get(
        `${registrationUrl}/years/${year}`
      )

      expect(statusCode).toBe(statusCodes.found)
      expect(headers.location).toBe(location)
    })

    test.each([
      ['accredited', accreditedUrl('20x5')],
      ['registered-only', registeredOnlyUrl('25')]
    ])('Should reject a malformed year on the %s page', async (_, url) => {
      useMockBackend()

      const { statusCode } = await get(url)

      expect(statusCode).toBe(statusCodes.badRequest)
    })
  })
})
