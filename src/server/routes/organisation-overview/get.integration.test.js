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

describe('#organisationOverviewController', () => {
  const originalBackendUrl = config.get('eprBackendUrl')
  const backendUrl = 'http://mock-backend'
  const organisationId = '69c3b4f0abda9efa68dd6697'
  const organisationNumber = '500123'
  const url = `/organisations/${organisationNumber}/overview`
  let server

  const exporter = {
    material: 'glass',
    status: { current: 'approved' },
    validFrom: '2026-01-01',
    wasteProcessingType: 'exporter',
    overseasSites: {},
    accreditations: {
      2026: {
        accreditationNumber: 'ACC-50030-001',
        status: { current: 'approved' }
      }
    }
  }

  const reprocessor = {
    material: 'plastic',
    status: { current: 'cancelled' },
    validFrom: '2026-01-01',
    wasteProcessingType: 'reprocessor',
    reprocessingType: 'input',
    site: {
      address: { line1: 'Site B', town: 'Leeds', postcode: 'LS1 1AA' }
    },
    accreditations: {}
  }

  const organisationView = {
    name: 'ACME Ltd',
    displayName: 'ACME',
    organisationNumber,
    status: { current: 'approved' },
    submittedToRegulator: { code: 'ea' },
    registrations: { 'REG-50030-001': exporter }
  }

  /** @param {object} body */
  const stubView = (body) =>
    mswServer.use(
      http.get(`${backendUrl}/organisations/${organisationNumber}`, () =>
        HttpResponse.json(body)
      )
    )

  /** @param {object} [credentials] */
  const getOverview = (credentials = mockUserSession) =>
    server.inject({
      method: 'GET',
      url,
      auth: { strategy: 'session', credentials }
    })

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
    beforeAll(() => {
      vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
    })

    test('Should return OK and render the organisation overview page', async () => {
      stubView(organisationView)

      const { statusCode } = await getOverview()

      expect(statusCode).toBe(statusCodes.ok)
    })

    test('Should render the company name as heading', async () => {
      stubView(organisationView)

      const { result } = await getOverview()

      const $ = cheerio.load(result)
      expect($('h1').text().trim()).toEqual('ACME Ltd')
    })

    test('Should render a breadcrumb linking to organisations list', async () => {
      stubView(organisationView)

      const { result } = await getOverview()

      const $ = cheerio.load(result)
      const breadcrumbLinks = $('.govuk-breadcrumbs__link')
      expect(breadcrumbLinks).toHaveLength(1)
      expect($(breadcrumbLinks[0]).text()).toEqual('Organisations')
      expect($(breadcrumbLinks[0]).attr('href')).toEqual('/organisations')
    })

    test('Should render table headers', async () => {
      stubView(organisationView)

      const { result } = await getOverview()

      const $ = cheerio.load(result)
      const headers = $('table thead tr th')
      expect(headers).toHaveLength(8)
      expect($(headers[0]).text()).toEqual('Registration number')
      expect($(headers[1]).text()).toEqual('Status')
      expect($(headers[2]).text()).toEqual('Processing type')
      expect($(headers[3]).text()).toEqual('Material')
      expect($(headers[4]).text()).toEqual('Site')
      expect($(headers[5]).text()).toEqual('Accreditation number')
      expect($(headers[6]).text()).toEqual('Accreditation')
      expect($(headers[7]).text()).toEqual('Actions')
    })

    test('Should render registration row data', async () => {
      stubView(organisationView)

      const { result } = await getOverview()

      const $ = cheerio.load(result)
      const cells = $('table tbody tr td')
      expect($(cells[0]).text().trim()).toEqual('REG-50030-001')
      expect($(cells[1]).find('strong.govuk-tag').text().trim()).toEqual(
        'approved'
      )
      expect($(cells[2]).text().trim()).toEqual('exporter')
      expect($(cells[3]).text().trim()).toEqual('glass')
      expect($(cells[4]).text().trim()).toEqual('')
      expect($(cells[5]).text().trim()).toEqual('ACC-50030-001')
      expect($(cells[6]).find('strong.govuk-tag').text().trim()).toEqual(
        '2026: approved'
      )

      const viewLink = $(cells[7]).find('a')
      expect(viewLink.text()).toEqual('View')
      expect(viewLink.attr('href')).toEqual(
        `/organisations/${organisationNumber}/registrations/REG-50030-001/overview`
      )
    })

    test('Should render a reprocessor with its reprocessing type and site', async () => {
      stubView({
        ...organisationView,
        registrations: { 'REG-50030-002': reprocessor }
      })

      const { result } = await getOverview()

      const $ = cheerio.load(result)
      const cells = $('table tbody tr td')
      expect($(cells[2]).text().trim()).toEqual('reprocessor - input')
      expect($(cells[4]).text().trim()).toEqual('Site B')
    })

    test('Should render a dash in accreditation cells when registration has no accreditation', async () => {
      stubView({
        ...organisationView,
        registrations: { 'REG-50030-002': reprocessor }
      })

      const { result } = await getOverview()

      const $ = cheerio.load(result)
      const cells = $('table tbody tr td')
      expect($(cells[5]).text().trim()).toEqual('-')
      expect($(cells[6]).text().trim()).toEqual('-')
    })

    test('Should render every year of accreditation, newest first', async () => {
      stubView({
        ...organisationView,
        registrations: {
          'REG-50030-001': {
            ...exporter,
            accreditations: {
              2027: {
                accreditationNumber: 'ACC-50030-027',
                status: { current: 'suspended' }
              },
              2026: {
                accreditationNumber: 'ACC-50030-026',
                status: { current: 'approved' }
              }
            }
          }
        }
      })

      const { result } = await getOverview()

      const $ = cheerio.load(result)
      const cells = $('table tbody tr td')
      expect(
        $(cells[5])
          .html()
          ?.split('<br>')
          .map((number) => number.trim())
      ).toStrictEqual(['ACC-50030-027', 'ACC-50030-026'])
      expect(
        $(cells[6])
          .find('strong.govuk-tag')
          .map((_, tag) => $(tag).text().trim())
          .get()
      ).toStrictEqual(['2027: suspended', '2026: approved'])
    })

    test('Should list the registrations by registration number', async () => {
      stubView({
        ...organisationView,
        registrations: {
          'REG-50030-002': reprocessor,
          'REG-50030-001': exporter
        }
      })

      const { result } = await getOverview()

      const $ = cheerio.load(result)
      const numbers = $('table tbody tr')
        .map((_, row) => $(row).find('td').first().text().trim())
        .get()
      expect(numbers).toStrictEqual(['REG-50030-001', 'REG-50030-002'])
    })

    describe('Defra ID link section', () => {
      const readOnlySession = { ...mockUserSession, scopes: ['admin.read'] }
      const linkedView = {
        ...organisationView,
        linkedDefraOrganisation: {
          defraOrganisation: {
            id: '550e8400-e29b-41d4-a716-446655440001',
            name: 'Lost Ark Adventures Ltd'
          },
          linkedAt: '2026-05-01T12:00:00.000Z',
          linkedBy: { email: 'linker@example.com' }
        }
      }

      test('shows the linked Defra ID org and unlink button for a write admin', async () => {
        vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
        stubView(linkedView)

        const { result } = await getOverview(mockUserSession)

        const $ = cheerio.load(result)
        const values = $('.govuk-summary-list__value')
          .map((_, value) => $(value).text().trim())
          .get()
        expect(values).toStrictEqual([
          'Lost Ark Adventures Ltd',
          '550e8400-e29b-41d4-a716-446655440001',
          '2026-05-01T12:00:00.000Z',
          'linker@example.com'
        ])
        expect($('a:contains("Unlink organisation")').attr('href')).toEqual(
          `/organisations/${organisationNumber}/unlink-defra-id/confirm`
        )
      })

      test('shows the linked Defra ID org but no unlink button for a read-only admin', async () => {
        vi.mocked(getUserSession).mockResolvedValue(readOnlySession)
        stubView(linkedView)

        const { result } = await getOverview(readOnlySession)

        expect(result).toContain('Lost Ark Adventures Ltd')
        const $ = cheerio.load(result)
        expect($('a:contains("Unlink organisation")')).toHaveLength(0)
      })

      test('shows "No linked organisation" when the org is not linked', async () => {
        vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
        stubView(organisationView)

        const { result } = await getOverview(mockUserSession)

        expect(result).toContain('No linked organisation')
        const $ = cheerio.load(result)
        expect($('a:contains("Unlink organisation")')).toHaveLength(0)
      })
    })

    test('Should show the not found page when the backend has no such organisation', async () => {
      mswServer.use(
        http.get(`${backendUrl}/organisations/${organisationNumber}`, () =>
          HttpResponse.json({}, { status: statusCodes.notFound })
        )
      )

      const { result, statusCode } = await getOverview()

      expect(statusCode).toBe(statusCodes.notFound)
      expect(result).toEqual(expect.stringContaining('Page not found'))
    })

    test('Should show 500 error page when backend returns a non-OK response', async () => {
      mswServer.use(
        http.get(`${backendUrl}/organisations/${organisationNumber}`, () => {
          throw HttpResponse.text('', { status: 500 })
        })
      )

      const { result } = await getOverview()

      expect(result).toEqual(
        expect.stringContaining('Sorry, there is a problem with the service')
      )
    })

    test('Should send the old id address to the organisation number address, keeping the query', async () => {
      mswServer.use(
        http.get(`${backendUrl}/v1/organisations/${organisationId}`, () =>
          HttpResponse.json({
            id: organisationId,
            orgId: 500123,
            registrations: [],
            accreditations: []
          })
        )
      )

      const { statusCode, headers } = await server.inject({
        method: 'GET',
        url: `/organisations/${organisationId}/overview?tab=users`,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      expect(statusCode).toBe(statusCodes.found)
      expect(headers.location).toBe(`${url}?tab=users`)
    })
  })
})
