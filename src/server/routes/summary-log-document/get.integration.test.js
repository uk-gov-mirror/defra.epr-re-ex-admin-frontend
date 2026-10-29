import { createServer } from '#server/server.js'
import { config } from '#config/config.js'
import { statusCodes } from '#server/common/constants/status-codes.js'
import { mockUserSession } from '#server/common/test-helpers/fixtures.js'
import { getUserSession } from '#server/common/helpers/auth/get-user-session.js'
import { createMockOidcServer } from '#server/common/test-helpers/mock-oidc.js'
import { http, server as mswServer, HttpResponse } from '#vite/setup-msw.js'
import * as cheerio from 'cheerio'

vi.mock('#server/common/helpers/auth/get-user-session.js', () => ({
  getUserSession: vi.fn().mockReturnValue(null)
}))

describe('GET summary log document', () => {
  const organisationId = '69c3b4f0abda9efa68dd6697'
  const registrationId = '69c3b4f0abda9efa68dd669b'
  const organisationNumber = '500123'
  const registrationNumber = 'R26ER5001180041PL'
  const summaryLogId = 'sl-123'
  const url = `/organisations/${organisationNumber}/registrations/${registrationNumber}/summary-logs/${summaryLogId}`
  const documentPath = `${url}/document`

  let server

  const summaryLogDocument = {
    version: 3,
    summaryLogId,
    status: 'submitted',
    year: 2026,
    uploadedAt: '2026-01-01T11:00:00.000Z',
    processingType: 'reprocessor',
    loadsByReportingPeriod: [
      {
        reportingPeriod: '2026-01',
        isOpen: true,
        loadsAdded: 4,
        balanceAffectingTonnage: 12.5
      }
    ]
  }

  beforeAll(async () => {
    createMockOidcServer()
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  const stubBackendDocument = (response) => {
    mswServer.use(
      http.get(`${config.get('eprBackendUrl')}${documentPath}`, () => response)
    )
  }

  const loadPage = async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url,
      auth: { strategy: 'session', credentials: mockUserSession }
    })
    return { $: cheerio.load(result), statusCode }
  }

  describe('When user is unauthenticated', () => {
    test('Should return unauthorised status code and unauthorised view', async () => {
      const { result, statusCode } = await server.inject({
        method: 'GET',
        url
      })

      expect(statusCode).toBe(statusCodes.unauthorised)
      expect(result).toEqual(expect.stringContaining('Unauthorised'))
    })
  })

  describe('When user is authenticated', () => {
    beforeEach(() => {
      vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
    })

    test('Should render the whole document as pretty-printed JSON', async () => {
      stubBackendDocument(HttpResponse.json(summaryLogDocument))

      const { $, statusCode } = await loadPage()

      expect(statusCode).toBe(statusCodes.ok)

      const dumped = $('.app-json-display').text()
      const parsed = JSON.parse(dumped)
      expect(parsed).toEqual(summaryLogDocument)
      expect(parsed.loadsByReportingPeriod).toHaveLength(1)
    })

    test("Should render breadcrumbs back to the registration overview and the log's year", async () => {
      stubBackendDocument(HttpResponse.json(summaryLogDocument))

      const { $ } = await loadPage()

      const overviewCrumb = $(
        `.govuk-breadcrumbs a[href="/organisations/${organisationNumber}/registrations/${registrationNumber}/overview"]`
      )
      expect(overviewCrumb).toHaveLength(1)

      const yearCrumb = $(
        `.govuk-breadcrumbs a[href="/organisations/${organisationNumber}/registrations/${registrationNumber}/years/2026"]`
      )
      expect(yearCrumb.text().trim()).toBe('2026')
    })

    test('Should send an old id URL to the natural-key URL', async () => {
      mswServer.use(
        http.get(
          `${config.get('eprBackendUrl')}/v1/organisations/${organisationId}`,
          () =>
            HttpResponse.json({
              id: organisationId,
              orgId: 500123,
              registrations: [{ id: registrationId, registrationNumber }],
              accreditations: []
            })
        )
      )

      const { statusCode, headers } = await server.inject({
        method: 'GET',
        url: `/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      expect(statusCode).toBe(statusCodes.found)
      expect(headers.location).toBe(url)
    })

    test('Should render the standard not-found page when the backend returns 404', async () => {
      stubBackendDocument(
        HttpResponse.json(
          { message: 'Not found' },
          { status: statusCodes.notFound }
        )
      )

      const { $, statusCode } = await loadPage()

      expect(statusCode).toBe(statusCodes.notFound)
      expect($.text()).toContain('Page not found')
    })

    test('Should show the service error page when the backend errors', async () => {
      stubBackendDocument(
        HttpResponse.json(
          { message: 'Server error' },
          { status: statusCodes.internalServerError }
        )
      )

      const { $, statusCode } = await loadPage()

      expect(statusCode).toBe(statusCodes.internalServerError)
      expect($.text()).toContain('Sorry, there is a problem with the service')
    })
  })
})
