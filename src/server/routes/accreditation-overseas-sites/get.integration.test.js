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
  queryByRole
} from '@testing-library/dom'
import { Window } from 'happy-dom'
import { vi } from 'vitest'

/** @import { OverseasSites, SiteApprovals } from './controller.get.js' */

vi.mock('#server/common/helpers/auth/get-user-session.js', () => ({
  getUserSession: vi.fn().mockReturnValue(null)
}))

describe('#accreditationOverseasSitesController', () => {
  const originalBackendUrl = config.get('eprBackendUrl')
  const backendUrl = 'http://mock-backend'
  const organisationNumber = '500123'
  const registrationNumber = 'E26ER5001180041GL'
  const registration = `/organisations/${organisationNumber}/registrations/${registrationNumber}`
  const url = `${registration}/accreditations/2026/overseas-sites`
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

  /** @type {OverseasSites} */
  const mockSites = {
    '001': {
      name: 'Beta Reprocessor',
      address: {
        country: 'Germany',
        line1: '2 Teststrasse',
        line2: 'Zone 2',
        townOrCity: 'Berlin',
        stateOrRegion: 'Berlin-Mitte',
        postcode: '10115'
      },
      coordinates: '52.5200,13.4050'
    },
    '002': {
      name: 'Gamma Recycling',
      address: {
        country: 'France',
        line1: '5 Rue de Test',
        townOrCity: 'Lyon'
      }
    }
  }

  /** @type {SiteApprovals} */
  const mockApprovals = {
    '001': { status: 'approved', approvedOn: '2024-01-01' },
    '002': { status: 'approved', approvedOn: '2024-06-15' }
  }

  /**
   * @param {OverseasSites} sites
   * @param {SiteApprovals} approvals
   */
  const exporterOrganisation = (sites, approvals) => ({
    name: 'ACME ltd',
    registrations: {
      [registrationNumber]: {
        material: 'glass',
        overseasSites: sites,
        accreditations: {
          2026: {
            accreditationNumber: 'ACC-50030-001',
            overseasSites: approvals
          }
        }
      }
    }
  })

  /** @param {object} organisation */
  const useMockBackend = (
    organisation = exporterOrganisation(mockSites, mockApprovals)
  ) => {
    mswServer.use(
      http.get(`${backendUrl}/organisations/${organisationNumber}`, () =>
        HttpResponse.json(organisation)
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

  const getSitesTable = (container) =>
    getByRole(container, 'table', { name: 'Overseas sites' })

  const getDataRows = (table) => getAllByRole(table, 'row').slice(1)

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

      const { statusCode } = await server.inject({ method: 'GET', url, auth })

      expect(statusCode).toBe(statusCodes.ok)
    })

    test('Should render the heading with company name and accreditation number', async () => {
      useMockBackend()

      const { result } = await server.inject({ method: 'GET', url, auth })

      expect(
        getByRole(renderPage(result), 'heading', { level: 1 })
      ).toHaveTextContent('ACME ltd - ACC-50030-001')
    })

    test.each([
      [
        'the registration is not found',
        { name: 'ACME ltd', registrations: {} }
      ],
      [
        'the registration has no accreditation for the year',
        {
          name: 'ACME ltd',
          registrations: { [registrationNumber]: { accreditations: {} } }
        }
      ],
      [
        'the accreditation is a reprocessor’s',
        {
          name: 'ACME ltd',
          registrations: {
            [registrationNumber]: {
              accreditations: { 2026: { accreditationNumber: 'ACC-1' } }
            }
          }
        }
      ]
    ])('Should return 404 when %s', async (_, organisation) => {
      useMockBackend(organisation)

      const { statusCode } = await server.inject({ method: 'GET', url, auth })

      expect(statusCode).toBe(statusCodes.notFound)
    })

    test("Should render breadcrumbs back to the registration's year", async () => {
      useMockBackend()

      const { result } = await server.inject({ method: 'GET', url, auth })

      const breadcrumbs = getByRole(renderPage(result), 'navigation', {
        name: 'Breadcrumb'
      })

      expect(
        getAllByRole(breadcrumbs, 'link').map((l) => ({
          text: l.textContent?.trim(),
          href: l.getAttribute('href')
        }))
      ).toEqual([
        { text: 'Organisations', href: '/organisations' },
        {
          text: 'Organisation overview',
          href: `/organisations/${organisationNumber}/overview`
        },
        { text: 'Registration overview', href: `${registration}/overview` },
        { text: '2026', href: `${registration}/years/2026` }
      ])
    })

    test('Should render the site columns without the constant identifier columns', async () => {
      useMockBackend()

      const { result } = await server.inject({ method: 'GET', url, auth })

      expect(
        getAllByRole(getSitesTable(renderPage(result)), 'columnheader').map(
          (h) => h.textContent?.trim()
        )
      ).toEqual([
        'ORS ID',
        'Packaging waste category',
        'Destination country',
        'Overseas reprocessor name',
        'Address line 1',
        'Address line 2',
        'City or town',
        'State, province or region',
        'Postcode or similar',
        'Coordinates',
        'Valid from'
      ])
    })

    test('Should render a site row keyed by its ORS id with site detail', async () => {
      useMockBackend()

      const { result } = await server.inject({ method: 'GET', url, auth })

      const rows = getDataRows(getSitesTable(renderPage(result)))

      expect(rows).toHaveLength(2)
      expect(
        getAllByRole(rows[0], 'cell').map((cell) => cell.textContent?.trim())
      ).toEqual([
        '001',
        'glass',
        'Germany',
        'Beta Reprocessor',
        '2 Teststrasse',
        'Zone 2',
        'Berlin',
        'Berlin-Mitte',
        '10115',
        '52.5200,13.4050',
        '1 January 2024'
      ])
    })

    test('Should distinguish approved from unapproved sites by their valid-from date', async () => {
      useMockBackend(
        exporterOrganisation(mockSites, {
          '001': { status: 'approved', approvedOn: '2024-01-01' },
          '002': { status: 'pending' }
        })
      )

      const { result } = await server.inject({ method: 'GET', url, auth })

      const rows = getDataRows(getSitesTable(renderPage(result)))

      expect(getAllByRole(rows[0], 'cell')[10]).toHaveTextContent(
        '1 January 2024'
      )
      expect(getAllByRole(rows[1], 'cell')[10]).toHaveTextContent('-')
    })

    test('Should list only the sites the accreditation lists', async () => {
      useMockBackend(
        exporterOrganisation(mockSites, {
          '002': { status: 'approved', approvedOn: '2024-06-15' }
        })
      )

      const { result } = await server.inject({ method: 'GET', url, auth })

      const rows = getDataRows(getSitesTable(renderPage(result)))

      expect(rows).toHaveLength(1)
      expect(getAllByRole(rows[0], 'cell')[0]).toHaveTextContent('002')
    })

    test('Should refuse a year that is not four digits', async () => {
      const { statusCode } = await server.inject({
        method: 'GET',
        url: `${registration}/accreditations/..%2F..%2Fadmin/overseas-sites`,
        auth
      })

      expect(statusCode).toBe(statusCodes.badRequest)
    })

    test('Should render a dash for absent address lines', async () => {
      useMockBackend()

      const { result } = await server.inject({ method: 'GET', url, auth })

      const cells = getAllByRole(
        getDataRows(getSitesTable(renderPage(result)))[1],
        'cell'
      )

      expect(cells[4]).toHaveTextContent('5 Rue de Test')
      expect(cells[5]).toHaveTextContent('-')
      expect(cells[6]).toHaveTextContent('Lyon')
      expect(cells[7]).toHaveTextContent('-')
      expect(cells[8]).toHaveTextContent('-')
      expect(cells[9]).toHaveTextContent('-')
    })

    test('Should render empty-state when there are no overseas sites', async () => {
      useMockBackend(exporterOrganisation({}, {}))

      const { result } = await server.inject({ method: 'GET', url, auth })

      const body = renderPage(result)

      expect(queryByRole(body, 'table', { name: 'Overseas sites' })).toBeNull()
      expect(getByText(body, 'No overseas sites')).toBeInTheDocument()
    })

    test('Should show 500 error page when backend returns a non-OK response', async () => {
      mswServer.use(
        http.get(`${backendUrl}/organisations/${organisationNumber}`, () => {
          throw HttpResponse.text('', { status: 500 })
        })
      )

      const { result } = await server.inject({ method: 'GET', url, auth })

      expect(
        getByText(
          renderPage(result),
          'Sorry, there is a problem with the service'
        )
      ).toBeInTheDocument()
    })
  })
})
