import { vi } from 'vitest'
import * as cheerio from 'cheerio'
import { config } from '#config/config.js'
import { statusCodes } from '#server/common/constants/status-codes.js'
import { mockUserSession } from '#server/common/test-helpers/fixtures.js'
import { getUserSession } from '#server/common/helpers/auth/get-user-session.js'
import { createMockOidcServer } from '#server/common/test-helpers/mock-oidc.js'
import { getCsrfToken } from '#server/common/test-helpers/csrf-helper.js'
import { http, server as mswServer, HttpResponse } from '#vite/setup-msw.js'
import { createServer } from '#server/server.js'

vi.mock('#server/common/helpers/auth/get-user-session.js', () => ({
  getUserSession: vi.fn().mockReturnValue(null)
}))

describe('report-unsubmit', () => {
  const backendUrl = config.get('eprBackendUrl')
  const organisationId = '69c3b4f0abda9efa68dd6697'
  const registrationId = '69c3b4f0abda9efa68dd669b'
  const organisationNumber = '500123'
  const registrationNumber = 'R25SR500020912PA'
  const year = '2026'
  const cadence = 'monthly'
  const period = '1'
  const submissionNumber = '1'

  const REGISTRATION_URL = `/organisations/${organisationNumber}/registrations/${registrationNumber}`
  const BASE_URL = `${REGISTRATION_URL}/accreditations/${year}/reports/${cadence}/${period}/submissions/${submissionNumber}`
  const confirmUrl = `${BASE_URL}/unsubmit/confirm`
  const postUrl = `${BASE_URL}/unsubmit`
  const resultUrl = `${BASE_URL}/unsubmit/result`
  const yearUrl = `${REGISTRATION_URL}/years/${year}`

  const storedOrganisation = {
    id: organisationId,
    orgId: 500123,
    registrations: [{ id: registrationId, registrationNumber }],
    accreditations: []
  }

  let server

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

  const stubStoredOrganisation = () =>
    mswServer.use(
      http.get(`${backendUrl}/v1/organisations/${organisationId}`, () =>
        HttpResponse.json(storedOrganisation)
      )
    )

  /**
   * @param {{
   *   currentStatus?: string,
   *   resubmissionRequired?: Record<string, unknown>,
   *   unsubmittedAt?: string
   * }} [report]
   */
  const stubReport = ({
    currentStatus = 'ready_to_submit',
    unsubmittedAt = '2026-05-06T10:00:00.000Z',
    resubmissionRequired = undefined
  } = {}) =>
    mswServer.use(
      http.get(`${backendUrl}${BASE_URL}`, () =>
        HttpResponse.json({
          status: currentStatus,
          ...(resubmissionRequired ? { resubmissionRequired } : {}),
          detail: {
            status: {
              currentStatus,
              ...(unsubmittedAt ? { unsubmitted: { at: unsubmittedAt } } : {})
            }
          }
        })
      )
    )

  const submittedSubmission = (n) => ({
    year: Number(year),
    period: Number(period),
    submissionNumber: n,
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    dueDate: '2026-02-20',
    periodStatus: 'submitted',
    report: {
      id: `report-${n}`,
      status: 'submitted',
      submissionNumber: n,
      submittedAt: '2026-02-10T09:00:00.000Z',
      submittedBy: 'Alice Regulator'
    }
  })

  const stubCalendar = (reportingPeriods = [submittedSubmission(1)]) =>
    mswServer.use(
      http.get(`${backendUrl}${REGISTRATION_URL}/reports/:year/calendar`, () =>
        HttpResponse.json({
          year: 2026,
          accredited: {
            accreditationNumber: 'ACC-1',
            reportingPeriods: reportingPeriods.map((item) => ({
              ...item,
              cadence
            }))
          }
        })
      )
    )

  // Every confirm-page request reads the calendar to spot a superseded
  // submission. Default to the unsuperseded case; tests override by calling
  // stubCalendar with their own periods.
  beforeEach(() => stubCalendar())

  const stubUnsubmitSuccess = () =>
    mswServer.use(
      http.post(`${backendUrl}${postUrl}`, () =>
        HttpResponse.json({ status: 'ready_to_submit' })
      )
    )

  const stubUnsubmitFailure = (status = 409) =>
    mswServer.use(
      http.post(`${backendUrl}${postUrl}`, () =>
        HttpResponse.json({ error: 'Conflict' }, { status })
      )
    )

  const authOptions = { strategy: 'session', credentials: mockUserSession }

  const getConfirm = async () => {
    const response = await server.inject({
      method: 'GET',
      url: confirmUrl,
      auth: authOptions
    })
    const cookies = [response.headers['set-cookie']].flat().filter(Boolean)

    return {
      response,
      redirectCookie: cookies.map((c) => c.split(';')[0]).join('; ')
    }
  }

  const expectYearPageFlash = async (redirectCookie, message) => {
    mswServer.use(
      http.get(`${backendUrl}/organisations/${organisationNumber}`, () =>
        HttpResponse.json({
          name: 'ACME Ltd',
          organisationNumber,
          registrations: {
            [registrationNumber]: {
              material: 'paper',
              status: {
                current: 'approved',
                timeline: [
                  { at: '2026-01-01T00:00:00.000Z', status: 'approved' }
                ]
              },
              wasteProcessingType: 'exporter',
              accreditations: {}
            }
          }
        })
      ),
      http.get(`${backendUrl}${REGISTRATION_URL}/summary-logs`, () =>
        HttpResponse.json({ summaryLogs: [] })
      )
    )

    const { headers } = await server.inject({
      method: 'GET',
      url: yearUrl,
      headers: { cookie: redirectCookie },
      auth: authOptions
    })
    expect(headers.location).toBe(`${REGISTRATION_URL}/registered-only/${year}`)

    const { result } = await server.inject({
      method: 'GET',
      url: `${headers.location}`,
      headers: { cookie: redirectCookie },
      auth: authOptions
    })

    expect(cheerio.load(result)('.govuk-error-summary').text()).toContain(
      message
    )
  }

  const postUnsubmit = async () => {
    const { cookie, crumb } = await getCsrfToken(
      server,
      confirmUrl,
      authOptions
    )
    return server.inject({
      method: 'POST',
      url: postUrl,
      auth: authOptions,
      headers: { cookie },
      payload: { crumb }
    })
  }

  test('unauthenticated requests are rejected', async () => {
    const { statusCode } = await server.inject({
      method: 'GET',
      url: confirmUrl
    })
    expect(statusCode).toBe(statusCodes.unauthorised)
  })

  test('confirm page shows report details and unsubmit action', async () => {
    vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
    stubReport({ currentStatus: 'submitted', unsubmittedAt: undefined })

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: confirmUrl,
      auth: authOptions
    })

    expect(statusCode).toBe(statusCodes.ok)
    const $ = cheerio.load(result)
    expect($('h1').text().trim()).toBe('Unsubmit report')
    expect(result).toContain('R25SR500020912PA')
    expect(result).toContain('January')
    expect($('body').text()).toMatch(/Submission:\s*1/)
    expect($('form').attr('action')).toBe(postUrl)
    expect($('a:contains("Cancel")').attr('href')).toBe(yearUrl)
  })

  describe('reached by an old id URL', () => {
    const oldBase = `/organisations/${organisationId}/registrations/${registrationId}/reports/${year}/${cadence}/${period}/submissions/${submissionNumber}`

    test('the confirm page is sent on to its natural-key address', async () => {
      vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
      stubStoredOrganisation()

      const toRegistration = await server.inject({
        method: 'GET',
        url: `${oldBase}/unsubmit/confirm`,
        auth: authOptions
      })
      const toAccreditation = await server.inject({
        method: 'GET',
        url: toRegistration.headers.location,
        auth: authOptions
      })

      expect(toRegistration.statusCode).toBe(statusCodes.found)
      expect(toAccreditation.statusCode).toBe(statusCodes.found)
      expect(toAccreditation.headers.location).toBe(confirmUrl)
    })

    test('the unsubmit is resent to its natural-key address with its body', async () => {
      vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
      stubStoredOrganisation()
      stubReport({ currentStatus: 'submitted', unsubmittedAt: undefined })
      const { cookie, crumb } = await getCsrfToken(
        server,
        confirmUrl,
        authOptions
      )

      /** @param {string} url */
      const resend = (url) =>
        server.inject({
          method: 'POST',
          url,
          auth: authOptions,
          headers: { cookie },
          payload: { crumb }
        })

      const toRegistration = await resend(`${oldBase}/unsubmit`)
      const toAccreditation = await resend(toRegistration.headers.location)

      expect(toRegistration.statusCode).toBe(statusCodes.temporaryRedirect)
      expect(toRegistration.headers.location).toBe(
        `${REGISTRATION_URL}/reports/${year}/${cadence}/${period}/submissions/${submissionNumber}/unsubmit`
      )
      expect(toAccreditation.statusCode).toBe(statusCodes.temporaryRedirect)
      expect(toAccreditation.headers.location).toBe(postUrl)
    })

    test('is not found when the organisation has no such registration', async () => {
      vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
      mswServer.use(
        http.get(`${backendUrl}/v1/organisations/${organisationId}`, () =>
          HttpResponse.json({ ...storedOrganisation, registrations: [] })
        )
      )

      const { statusCode } = await server.inject({
        method: 'GET',
        url: `${oldBase}/unsubmit/confirm`,
        auth: authOptions
      })

      expect(statusCode).toBe(statusCodes.notFound)
    })
  })

  test('confirm page redirects to the year page for a non-submitted report', async () => {
    vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
    stubReport({ currentStatus: 'ready_to_submit', unsubmittedAt: undefined })

    const { response, redirectCookie } = await getConfirm()

    expect(response.statusCode).toBe(statusCodes.found)
    expect(response.headers.location).toBe(yearUrl)
    await expectYearPageFlash(
      redirectCookie,
      'This report cannot be unsubmitted because it is no longer submitted.'
    )
  })

  it.each([
    {
      flaggedBy: 'the operator',
      resubmissionRequired: {
        operatorRequested: { at: '2026-05-01T10:00:00.000Z' }
      }
    },
    {
      flaggedBy: 'a closed period restatement',
      resubmissionRequired: {
        closedPeriodRestated: { summaryLogId: 'sl-restated' }
      }
    }
  ])(
    'should redirect to the year page for a report flagged for resubmission by $flaggedBy',
    async ({ resubmissionRequired }) => {
      vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
      stubReport({
        currentStatus: 'submitted',
        unsubmittedAt: undefined,
        resubmissionRequired
      })

      const { response, redirectCookie } = await getConfirm()

      expect(response.statusCode).toBe(statusCodes.found)
      expect(response.headers.location).toBe(yearUrl)
      await expectYearPageFlash(
        redirectCookie,
        'This report cannot be unsubmitted because a resubmission has been requested for this period.'
      )
    }
  )

  it('should redirect to the year page for a submission superseded by a later one', async () => {
    vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
    stubReport({ currentStatus: 'submitted', unsubmittedAt: undefined })
    stubCalendar([submittedSubmission(1), submittedSubmission(2)])

    const { response, redirectCookie } = await getConfirm()

    expect(response.statusCode).toBe(statusCodes.found)
    expect(response.headers.location).toBe(yearUrl)
    await expectYearPageFlash(
      redirectCookie,
      'This report cannot be unsubmitted because a later submission has superseded it.'
    )
  })

  it('should read the calendar of the year in the URL', async () => {
    vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
    const earlierBase = BASE_URL.replace(`/${year}/`, '/2025/')
    const inEarlierYear = (n) => ({ ...submittedSubmission(n), year: 2025 })
    mswServer.use(
      http.get(`${backendUrl}${earlierBase}`, () =>
        HttpResponse.json({ status: 'submitted' })
      ),
      http.get(
        `${backendUrl}${REGISTRATION_URL}/reports/:year/calendar`,
        ({ params }) =>
          HttpResponse.json({
            year: Number(params.year),
            ...(params.year === '2025' && {
              accredited: {
                accreditationNumber: 'ACC-1',
                reportingPeriods: [inEarlierYear(1), inEarlierYear(2)].map(
                  (item) => ({ ...item, cadence })
                )
              }
            })
          })
      )
    )

    const { statusCode, headers } = await server.inject({
      method: 'GET',
      url: `${earlierBase}/unsubmit/confirm`,
      auth: authOptions
    })

    expect(statusCode).toBe(statusCodes.found)
    expect(headers.location).toBe(`${REGISTRATION_URL}/years/2025`)
  })

  it('should not take a superseded quarter for the month that starts with it', async () => {
    vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
    stubReport({ currentStatus: 'submitted', unsubmittedAt: undefined })
    const inFirstQuarter = (n) => ({
      ...submittedSubmission(n),
      cadence: 'quarterly',
      endDate: '2026-03-31',
      dueDate: '2026-04-20'
    })
    mswServer.use(
      http.get(`${backendUrl}${REGISTRATION_URL}/reports/:year/calendar`, () =>
        HttpResponse.json({
          year: 2026,
          registeredOnly: {
            reportingPeriods: [inFirstQuarter(1), inFirstQuarter(2)]
          },
          accredited: {
            accreditationNumber: 'ACC-1',
            reportingPeriods: [{ ...submittedSubmission(1), cadence }]
          }
        })
      )
    )

    const { response } = await getConfirm()

    expect(response.statusCode).toBe(statusCodes.ok)
  })

  test('submitting the confirmation redirects to the success page', async () => {
    vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
    stubReport({ currentStatus: 'submitted', unsubmittedAt: undefined })
    stubUnsubmitSuccess()

    const { statusCode, headers } = await postUnsubmit()

    expect(statusCode).toBe(statusCodes.found)
    expect(headers.location).toBe(resultUrl)
  })

  test('backend failure shows the unsubmit failed page', async () => {
    vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
    stubReport({ currentStatus: 'submitted', unsubmittedAt: undefined })
    stubUnsubmitFailure()

    const { result, statusCode } = await postUnsubmit()

    expect(statusCode).toBe(statusCodes.ok)
    const $ = cheerio.load(result)
    expect($('.govuk-panel__title').text().trim()).toBe('Unsubmit failed')
    expect($('body').text()).toMatch(/Submission:\s*1/)
  })

  it('should say why the unsubmit was refused when the backend rejects it', async () => {
    vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
    stubReport({ currentStatus: 'submitted', unsubmittedAt: undefined })
    stubUnsubmitFailure(statusCodes.conflict)

    const { result } = await postUnsubmit()

    expect(cheerio.load(result)('body').text()).toContain(
      'The report could not be unsubmitted because its status has changed. It may have been superseded by a later submission, or flagged for resubmission.'
    )
  })

  it('should not offer a reason when the backend fails for any other cause', async () => {
    vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
    stubReport({ currentStatus: 'submitted', unsubmittedAt: undefined })
    stubUnsubmitFailure(statusCodes.internalServerError)

    const bodyText = cheerio
      .load((await postUnsubmit()).result)('body')
      .text()

    expect(bodyText).toContain('The report could not be unsubmitted.')
    expect(bodyText).not.toContain('its status has changed')
  })

  test('success page confirms the report was unsubmitted', async () => {
    vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
    stubReport()

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: resultUrl,
      auth: authOptions
    })

    expect(statusCode).toBe(statusCodes.ok)
    const $ = cheerio.load(result)
    expect($('.govuk-panel__title').text().trim()).toBe('Report unsubmitted')
    expect(result).toContain('R25SR500020912PA')
    expect($('body').text()).toMatch(/Submission:\s*1/)
    expect($('a:contains("Back to 2026")').attr('href')).toBe(yearUrl)
  })

  test('result page redirects to the year page when accessed without completing unsubmit', async () => {
    vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
    stubReport({ currentStatus: 'submitted', unsubmittedAt: undefined })

    const { statusCode, headers } = await server.inject({
      method: 'GET',
      url: resultUrl,
      auth: authOptions
    })

    expect(statusCode).toBe(statusCodes.found)
    expect(headers.location).toBe(yearUrl)
  })
})
