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

vi.mock('#server/common/helpers/auth/get-user-session.js', () => ({
  getUserSession: vi.fn().mockReturnValue(null)
}))

describe('#wasteBalanceEventsController', () => {
  const originalBackendUrl = config.get('eprBackendUrl')
  const backendUrl = 'http://mock-backend'
  const organisationNumber = '500123'
  const registrationNumber = 'R26ER5001180041PL'
  const registration = `/organisations/${organisationNumber}/registrations/${registrationNumber}`
  const accreditation = `${registration}/accreditations/2026`
  const url = `${accreditation}/waste-balance-events`
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

  const mockOrganisation = {
    name: 'ACME ltd',
    registrations: {
      [registrationNumber]: {
        accreditations: { 2026: { accreditationNumber: 'ACC-50030-001' } }
      }
    }
  }

  const mockEvents = [
    {
      number: 1,
      kind: 'summary-log-submitted',
      summaryLog: { id: 'sl-1', creditTotal: 100 },
      balance: {
        opening: {
          total: 0,
          available: 0,
          decemberTotal: 0,
          decemberAvailable: 0
        },
        closing: {
          total: 100,
          available: 100,
          decemberTotal: 30,
          decemberAvailable: 30
        }
      },
      createdAt: '2026-01-15T10:00:00.000Z',
      createdBy: {
        id: 'user-1',
        name: 'Test User',
        email: 'test.user@example.com'
      }
    },
    {
      number: 2,
      kind: 'prn-created',
      prn: { id: 'prn-1', tonnage: 50 },
      balance: {
        opening: {
          total: 100,
          available: 100,
          decemberTotal: 30,
          decemberAvailable: 30
        },
        closing: {
          total: 100,
          available: 50,
          decemberTotal: 30,
          decemberAvailable: 20
        }
      },
      createdAt: '2026-01-16T14:30:00.000Z',
      createdBy: { id: 'user-1', name: 'Test User' }
    }
  ]

  const renderPage = (html) => {
    const window = new Window()
    window.document.body.innerHTML = html
    return /** @type {HTMLElement} */ (
      /** @type {unknown} */ (window.document.body)
    )
  }

  const getEventsTable = (container) =>
    getByRole(container, 'table', { name: 'Waste balance events' })

  const getDataRows = (table) => getAllByRole(table, 'row').slice(1)

  const useMockBackend = (eventsResponse = mockEvents) => {
    mswServer.use(
      http.get(`${backendUrl}/organisations/${organisationNumber}`, () =>
        HttpResponse.json(mockOrganisation)
      ),
      http.get(`${backendUrl}${accreditation}/ledger`, () =>
        HttpResponse.json({ events: eventsResponse })
      )
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

    test('Should render the heading with company name and accreditation number', async () => {
      useMockBackend()

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)

      expect(getByRole(body, 'heading', { level: 1 })).toHaveTextContent(
        'ACME ltd - ACC-50030-001'
      )
    })

    test('Should refuse a year that is not four digits', async () => {
      const { statusCode } = await server.inject({
        method: 'GET',
        url: `${registration}/accreditations/..%2F..%2Fadmin/waste-balance-events`,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      expect(statusCode).toBe(statusCodes.badRequest)
    })

    test('Should return 404 when the backend finds no such accreditation', async () => {
      useMockBackend()
      mswServer.use(
        http.get(`${backendUrl}${accreditation}/ledger`, () =>
          HttpResponse.json({}, { status: 404 })
        )
      )

      const { statusCode } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      expect(statusCode).toBe(statusCodes.notFound)
    })

    test("Should render breadcrumbs back to the registration's year", async () => {
      useMockBackend()

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)
      const breadcrumbs = getByRole(body, 'navigation', {
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
        {
          text: 'Registration overview',
          href: `${registration}/overview`
        },
        { text: '2026', href: `${registration}/years/2026` }
      ])
    })

    test('Should render events table with correct columns', async () => {
      useMockBackend()

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)

      expect(
        getAllByRole(getEventsTable(body), 'columnheader').map((h) =>
          h.textContent?.trim()
        )
      ).toEqual([
        'Number',
        'Kind',
        'Date',
        'Created by',
        'Subject',
        'Closing balance',
        'Closing available',
        'December closing',
        'December available'
      ])
    })

    test('Should render event rows with correct data', async () => {
      useMockBackend()

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)
      const rows = getDataRows(getEventsTable(body))

      expect(rows).toHaveLength(2)

      const firstCells = getAllByRole(rows[0], 'cell')
      expect(firstCells[0]).toHaveTextContent('1')
      expect(firstCells[1]).toHaveTextContent('summary-log-submitted')
      expect(firstCells[3]).toHaveTextContent(
        'Test User (test.user@example.com)'
      )
      expect(firstCells[5]).toHaveTextContent('100')
      expect(firstCells[6]).toHaveTextContent('100')
      expect(firstCells[7]).toHaveTextContent('30')
      expect(firstCells[8]).toHaveTextContent('30')

      const secondCells = getAllByRole(rows[1], 'cell')
      expect(secondCells[0]).toHaveTextContent('2')
      expect(secondCells[1]).toHaveTextContent('prn-created')
      expect(secondCells[3]).toHaveTextContent('Test User')
      expect(secondCells[5]).toHaveTextContent('100')
      expect(secondCells[6]).toHaveTextContent('50')
      expect(secondCells[7]).toHaveTextContent('30')
      expect(secondCells[8]).toHaveTextContent('20')
    })

    test("Should render '-' for December amounts when the backend omits them", async () => {
      useMockBackend([
        /** @type {any} */ ({
          number: 6,
          kind: 'summary-log-submitted',
          summaryLog: { id: 'sl-2', creditTotal: 100 },
          balance: {
            opening: { total: 0, available: 0 },
            closing: { total: 100, available: 100 }
          },
          createdAt: '2026-01-20T10:00:00.000Z',
          createdBy: { id: 'user-1', name: 'Test User' }
        })
      ])

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)
      const cells = getAllByRole(getDataRows(getEventsTable(body))[0], 'cell')

      expect(cells[7]).toHaveTextContent('-')
      expect(cells[8]).toHaveTextContent('-')
    })

    it('should render the subject as json inside a code element', async () => {
      useMockBackend()

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)
      const [firstRow] = getDataRows(getEventsTable(body))
      const subjectCell = getAllByRole(firstRow, 'cell')[4]

      expect(subjectCell.querySelector('code')?.textContent).toBe(
        '{"summaryLog":{"id":"sl-1","creditTotal":100}}'
      )
    })

    it('should render a subject carrying markup as text, not markup', async () => {
      const summaryLog = {
        id: '</code><img src="x" onerror="alert(1)">',
        creditTotal: 100
      }
      useMockBackend([
        {
          number: 5,
          kind: 'summary-log-submitted',
          summaryLog,
          balance: {
            opening: {
              total: 0,
              available: 0,
              decemberTotal: 0,
              decemberAvailable: 0
            },
            closing: {
              total: 100,
              available: 100,
              decemberTotal: 30,
              decemberAvailable: 30
            }
          },
          createdAt: '2026-01-19T10:00:00.000Z',
          createdBy: {
            id: 'user-1',
            name: 'Test User',
            email: 'test.user@example.com'
          }
        }
      ])

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)
      const [firstRow] = getDataRows(getEventsTable(body))
      const subjectCell = getAllByRole(firstRow, 'cell')[4]

      expect(subjectCell.querySelector('img')).toBeNull()
      expect(subjectCell.textContent).toBe(JSON.stringify({ summaryLog }))
    })

    test('Should render empty Created by when actor has only id', async () => {
      useMockBackend([
        {
          number: 3,
          kind: 'prn-created',
          prn: { id: 'prn-2', tonnage: 10 },
          balance: {
            opening: {
              total: 50,
              available: 50,
              decemberTotal: 0,
              decemberAvailable: 0
            },
            closing: {
              total: 50,
              available: 40,
              decemberTotal: 0,
              decemberAvailable: 0
            }
          },
          createdAt: '2026-01-17T09:00:00.000Z',
          createdBy: /** @type {any} */ ({ id: 'user-2' })
        }
      ])

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)
      const rows = getDataRows(getEventsTable(body))
      const cells = getAllByRole(rows[0], 'cell')

      expect(cells[3]).toBeEmptyDOMElement()
    })

    test('Should render email as Created by when actor has no name', async () => {
      useMockBackend([
        {
          number: 4,
          kind: 'prn-issued',
          prn: { id: 'prn-3', tonnage: 20 },
          balance: {
            opening: {
              total: 50,
              available: 40,
              decemberTotal: 0,
              decemberAvailable: 0
            },
            closing: {
              total: 50,
              available: 40,
              decemberTotal: 0,
              decemberAvailable: 0
            }
          },
          createdAt: '2026-01-18T11:00:00.000Z',
          createdBy: /** @type {any} */ ({
            id: 'user-3',
            email: 'only@example.com'
          })
        }
      ])

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)
      const rows = getDataRows(getEventsTable(body))
      const cells = getAllByRole(rows[0], 'cell')

      expect(cells[3]).toHaveTextContent('only@example.com')
    })

    test('Should render "No waste balance events" when events list is empty', async () => {
      useMockBackend([])

      const { result } = await server.inject({
        method: 'GET',
        url,
        auth: { strategy: 'session', credentials: mockUserSession }
      })

      const body = renderPage(result)

      expect(
        queryByRole(body, 'table', { name: 'Waste balance events' })
      ).toBeNull()
      expect(getByText(body, 'No waste balance events')).toBeInTheDocument()
    })

    test('Should show 500 error page when backend returns a non-OK response', async () => {
      useMockBackend()
      mswServer.use(
        http.get(`${backendUrl}/organisations/${organisationNumber}`, () => {
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
  })
})
