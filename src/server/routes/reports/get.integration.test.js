import { config } from '#config/config.js'
import { statusCodes } from '#server/common/constants/status-codes.js'
import { getUserSession } from '#server/common/helpers/auth/get-user-session.js'
import { mockUserSession } from '#server/common/test-helpers/fixtures.js'
import { createMockOidcServer } from '#server/common/test-helpers/mock-oidc.js'
import { createServer } from '#server/server.js'
import { vi } from 'vitest'
import { http, HttpResponse, server as mswServer } from '#vite/setup-msw.js'
import * as cheerio from 'cheerio'

vi.mock('#server/common/helpers/auth/get-user-session.js', () => ({
  getUserSession: vi.fn().mockReturnValue(null)
}))

describe('#reportDetailController', () => {
  const originalBackendUrl = config.get('eprBackendUrl')
  const backendUrl = 'http://mock-backend'
  const organisationId = '69c3b4f0abda9efa68dd6697'
  const registrationId = '69c3b4f0abda9efa68dd669b'
  const organisationNumber = '500123'
  const registrationNumber = 'R26ER5001180041PL'
  const registration = `/organisations/${organisationNumber}/registrations/${registrationNumber}`
  const url = `${registration}/accreditations/2026/reports/monthly/1/submissions/1`
  const registeredOnlyUrl = `${registration}/reports/2026/quarterly/1/submissions/1`
  const auth = { strategy: 'session', credentials: mockUserSession }
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

  const mockReport = {
    year: 2026,
    cadence: 'monthly',
    period: 1,
    submissionNumber: 1,
    status: 'ready_to_submit'
  }

  /** @param {string} path */
  const serveReportAt = (path) =>
    mswServer.use(
      http.get(`${backendUrl}${path}`, () => HttpResponse.json(mockReport))
    )

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

    test('Should read an accredited report from its natural-key route', async () => {
      serveReportAt(url)

      const { statusCode } = await server.inject({ method: 'GET', url, auth })

      expect(statusCode).toBe(statusCodes.ok)
    })

    test('Should read a registered-only report from its natural-key route', async () => {
      serveReportAt(registeredOnlyUrl)

      const { statusCode } = await server.inject({
        method: 'GET',
        url: registeredOnlyUrl,
        auth
      })

      expect(statusCode).toBe(statusCodes.ok)
    })

    test('Should send an accredited report reached under the registration to the accreditation', async () => {
      const { statusCode, headers } = await server.inject({
        method: 'GET',
        url: `${registration}/reports/2026/monthly/1/submissions/1`,
        auth
      })

      expect(statusCode).toBe(statusCodes.found)
      expect(headers.location).toBe(url)
    })

    test('Should send a registered-only report reached under the accreditation to the registration', async () => {
      const { statusCode, headers } = await server.inject({
        method: 'GET',
        url: `${registration}/accreditations/2026/reports/quarterly/1/submissions/1`,
        auth
      })

      expect(statusCode).toBe(statusCodes.found)
      expect(headers.location).toBe(registeredOnlyUrl)
    })

    test('Should send an old id URL to the natural-key URL', async () => {
      mswServer.use(
        http.get(`${backendUrl}/v1/organisations/${organisationId}`, () =>
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
        url: `/organisations/${organisationId}/registrations/${registrationId}/reports/2026/quarterly/1/submissions/1`,
        auth
      })

      expect(statusCode).toBe(statusCodes.found)
      expect(headers.location).toBe(registeredOnlyUrl)
    })

    test('Should render summary of which report is being viewed as heading', async () => {
      serveReportAt(url)

      const { result } = await server.inject({ method: 'GET', url, auth })

      const $ = cheerio.load(result)
      expect($('h1').text().trim()).toEqual(
        'Report – 2026 monthly period 1 submission 1'
      )
    })

    test('Should render breadcrumbs for Organisations, Organisation overview, Registration overview and the year', async () => {
      serveReportAt(url)

      const { result } = await server.inject({ method: 'GET', url, auth })

      const $ = cheerio.load(result)
      const breadcrumbLinks = $('.govuk-breadcrumbs__link')
      expect(breadcrumbLinks).toHaveLength(4)
      expect($(breadcrumbLinks[0]).text()).toEqual('Organisations')
      expect($(breadcrumbLinks[0]).attr('href')).toEqual('/organisations')
      expect($(breadcrumbLinks[1]).text()).toEqual('Organisation overview')
      expect($(breadcrumbLinks[1]).attr('href')).toEqual(
        `/organisations/${organisationNumber}/overview`
      )
      expect($(breadcrumbLinks[2]).text()).toEqual('Registration overview')
      expect($(breadcrumbLinks[2]).attr('href')).toEqual(
        `${registration}/overview`
      )
      expect($(breadcrumbLinks[3]).text()).toEqual('2026')
      expect($(breadcrumbLinks[3]).attr('href')).toEqual(
        `${registration}/years/2026`
      )
    })

    test('Should render the report JSON in a code block', async () => {
      serveReportAt(url)

      const { result } = await server.inject({ method: 'GET', url, auth })

      const $ = cheerio.load(result)
      const code = $('[data-testid="report-json"]')
      expect(code).toHaveLength(1)
      expect(JSON.parse(code.text())).toEqual(mockReport)
    })

    test('Should ask for the report with all of its detail', async () => {
      /** @type {URL | undefined} */
      let requested
      mswServer.use(
        http.get(`${backendUrl}${url}`, ({ request }) => {
          requested = new URL(request.url)
          return HttpResponse.json(mockReport)
        })
      )

      await server.inject({ method: 'GET', url, auth })

      expect(requested?.searchParams.get('expand')).toBe('detail')
    })

    test('Should show 500 error page when backend returns a non-OK response', async () => {
      mswServer.use(
        http.get(`${backendUrl}${url}`, () => {
          throw HttpResponse.text('', { status: 500 })
        })
      )

      const { result } = await server.inject({ method: 'GET', url, auth })

      expect(result).toEqual(
        expect.stringContaining('Sorry, there is a problem with the service')
      )
    })
  })
})
