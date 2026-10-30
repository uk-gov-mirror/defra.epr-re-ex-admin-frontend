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

describe('#registrationOverviewController', () => {
  const originalBackendUrl = config.get('eprBackendUrl')
  const backendUrl = 'http://mock-backend'
  const organisationId = '69c3b4f0abda9efa68dd6697'
  const registrationId = '69c3b4f0abda9efa68dd669b'
  const organisationNumber = '500123'
  const registrationNumber = 'REG-50030-001'
  const registrationUrl = `/organisations/${organisationNumber}/registrations/${registrationNumber}`
  const url = `${registrationUrl}/overview`
  const organisationViewUrl = `${backendUrl}/organisations/${organisationNumber}`
  let server

  beforeAll(async () => {
    vi.useFakeTimers({
      now: new Date('2026-10-29T12:00:00.000Z'),
      toFake: ['Date']
    })
    config.set('eprBackendUrl', backendUrl)
    createMockOidcServer()
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    vi.useRealTimers()
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
      timeline: [{ at: '2024-02-01T00:00:00.000Z', status: 'approved' }]
    },
    validFrom: '2024-02-01',
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

  const renderPage = (html) => {
    const window = new Window()
    window.document.body.innerHTML = html
    return /** @type {HTMLElement} */ (
      /** @type {unknown} */ (window.document.body)
    )
  }

  const getSummaryRow = (container, label) => {
    const term = getByText(container, label, { selector: 'dt' })
    return /** @type {HTMLElement} */ (term.closest('.govuk-summary-list__row'))
  }

  const getSummaryRowValue = (container, label) =>
    /** @type {HTMLElement} */ (
      getSummaryRow(container, label).querySelector(
        '.govuk-summary-list__value'
      )
    )

  /** @param {object} [organisation] */
  const useMockBackend = (
    organisation = organisationHolding(mockRegistration)
  ) => {
    mswServer.use(
      http.get(organisationViewUrl, () => HttpResponse.json(organisation))
    )
  }

  /** @param {string} [path] */
  const get = (path = url) =>
    server.inject({
      method: 'GET',
      url: path,
      auth: { strategy: 'session', credentials: mockUserSession }
    })

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

    test('Should render the company name and registration number as heading', async () => {
      useMockBackend()

      const { statusCode, result } = await get()
      const body = renderPage(result)

      expect(statusCode).toBe(statusCodes.ok)
      expect(getByRole(body, 'heading', { level: 1 })).toHaveTextContent(
        'ACME ltd - REG-50030-001'
      )
    })

    test('Should render breadcrumbs for Organisations and Overview', async () => {
      useMockBackend()

      const { result } = await get()
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
        }
      ])
    })

    test('Should render summary list with status, processing type, material, site and waste records', async () => {
      useMockBackend()

      const { result } = await get()
      const body = renderPage(result)

      expect(
        within(getSummaryRowValue(body, 'Status')).getByText('approved')
      ).toHaveClass('govuk-tag')
      expect(getSummaryRowValue(body, 'Processing type')).toHaveTextContent(
        'reprocessor - input'
      )
      expect(getSummaryRowValue(body, 'Material')).toHaveTextContent('glass')
      expect(getSummaryRowValue(body, 'Site')).toHaveTextContent('Site A')
      expect(
        within(getSummaryRowValue(body, 'Waste records')).getByRole('link', {
          name: 'Download'
        })
      ).toHaveAttribute('href', `${registrationUrl}/waste-records/download`)
      expect(
        getSummaryRow(body, 'Status').querySelector(
          '.govuk-summary-list__actions'
        )
      ).toBeNull()
    })

    test('Should leave the year-specific sections to the year pages', async () => {
      useMockBackend()

      const { result } = await get()
      const body = renderPage(result)

      for (const label of [
        'Accreditation number',
        'Waste balance (tonnes)',
        'Waste balance events',
        'PRN activity'
      ]) {
        expect(queryByText(body, label, { selector: 'dt' })).toBeNull()
      }
      expect(queryByRole(body, 'table', { name: 'Reports' })).toBeNull()
      expect(queryByRole(body, 'table', { name: 'Summary logs' })).toBeNull()
    })

    test('Should list each year with its statuses, newest first', async () => {
      useMockBackend()

      const { result } = await get()
      const table = getByRole(renderPage(result), 'table', { name: 'Years' })

      expect(
        getAllByRole(table, 'columnheader').map((th) => th.textContent?.trim())
      ).toEqual([
        'Year',
        'Accreditation status',
        'Accreditation number',
        'Actions'
      ])
      expect(
        getAllByRole(table, 'row')
          .slice(1)
          .map((row) =>
            getAllByRole(row, 'cell').map((cell) =>
              cell.textContent?.trim().replaceAll(/\s+/g, ' ')
            )
          )
      ).toEqual([
        ['2026', 'approved', 'ACC-50030-001', 'View 2026'],
        ['2025', 'Not accredited', '-', 'View 2025'],
        ['2024', 'Not accredited', '-', 'View 2024']
      ])
    })

    test('Should grey out only the accreditation status of a year without one', async () => {
      useMockBackend()

      const { result } = await get()
      const table = getByRole(renderPage(result), 'table', { name: 'Years' })

      expect(
        getAllByRole(table, 'row')
          .slice(1)
          .map(
            (row) =>
              getAllByRole(row, 'cell')[1]
                .querySelector('.govuk-tag')
                ?.classList.contains('govuk-tag--grey') ?? false
          )
      ).toEqual([false, true, true])
    })

    test('Should link an accredited year to its accredited page and others to their registered-only page', async () => {
      useMockBackend()

      const { result } = await get()
      const table = getByRole(renderPage(result), 'table', { name: 'Years' })

      expect(
        getAllByRole(table, 'link').map((link) => link.getAttribute('href'))
      ).toEqual([
        `${registrationUrl}/accreditations/2026`,
        `${registrationUrl}/registered-only/2025`,
        `${registrationUrl}/registered-only/2024`
      ])
    })

    test('Should say there are no years for a registration never approved', async () => {
      useMockBackend(
        organisationHolding({
          ...mockRegistration,
          status: { current: 'created', timeline: [] },
          accreditations: {}
        })
      )

      const { result } = await get()
      const body = renderPage(result)

      expect(queryByRole(body, 'table', { name: 'Years' })).toBeNull()
      expect(getByText(body, 'No years')).toBeInTheDocument()
    })

    test('Should show the not found page for a registration number the organisation does not hold', async () => {
      useMockBackend(organisationHolding(mockRegistration, 'REG-OTHER'))

      const { statusCode } = await get()

      expect(statusCode).toBe(statusCodes.notFound)
    })

    test('Should send the old id address to the registration number address', async () => {
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

      const { statusCode, headers } = await get(
        `/organisations/${organisationId}/registrations/${registrationId}/overview`
      )

      expect(statusCode).toBe(statusCodes.found)
      expect(headers.location).toBe(url)
    })

    test('Should show 500 error page when backend returns a non-OK response', async () => {
      mswServer.use(
        http.get(organisationViewUrl, () =>
          HttpResponse.json({}, { status: 500 })
        )
      )

      const { statusCode } = await get()

      expect(statusCode).toBe(statusCodes.internalServerError)
    })
  })
})
