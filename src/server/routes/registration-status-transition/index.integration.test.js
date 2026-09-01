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

const TRANSITION_CASES = [
  {
    action: 'approve',
    heading: 'Approve registration',
    warningText:
      'This action must only be taken following the required legal process for approval and following instruction from an industry regulator. Approving a registration registers the operator for this site and material — they must submit the registered-only summary log and report quarterly. It does not permit PRN/PERN issuing (an accreditation is required for that).',
    buttonText: 'Approve now',
    fallbackError:
      'There was a problem approving the registration. Please try again.',
    formPayload: {
      'validFrom-day': '1',
      'validFrom-month': '8',
      'validFrom-year': '2026',
      registrationNumber: 'REG999999'
    },
    expectedBody: {
      fromStatus: 'created',
      toStatus: 'approved',
      validFrom: '2026-08-01',
      registrationNumber: 'REG999999'
    },
    hasGrantFields: true
  },
  {
    action: 'reject',
    heading: 'Reject registration',
    warningText:
      'This action must only be taken following the required legal process for refusing a registration application and following instruction from an industry regulator. Rejecting a registration means the operator is not registered for this site and material: they cannot submit summary logs and have no reporting obligation',
    buttonText: 'Reject now',
    fallbackError:
      'There was a problem rejecting the registration. Please try again.',
    formPayload: {},
    expectedBody: { fromStatus: 'created', toStatus: 'rejected' }
  },
  {
    action: 'reopen',
    heading: 'Reopen registration',
    warningText:
      'This action must only be taken following instruction from an industry regulator. Reopening a rejected registration returns the application to created so it can be reworked and reconsidered. The operator is not registered for this site and material unless the registration is subsequently approved',
    buttonText: 'Reopen now',
    fallbackError:
      'There was a problem reopening the registration. Please try again.',
    formPayload: {},
    expectedBody: { fromStatus: 'rejected', toStatus: 'created' }
  },
  {
    action: 'cancel',
    heading: 'Cancel registration',
    warningText:
      'This action must only be taken following the required legal process for cancellation and following instruction from an industry regulator. Cancelling a registration is permanent: the operator is no longer registered for this site and material and has no reporting obligation. Any live accreditation linked to it is also cancelled, so the operator can no longer issue PRNs and tonnages declared after the cancellation will not count towards their waste balance',
    buttonText: 'Cancel registration now',
    fallbackError:
      'There was a problem cancelling the registration. Please try again.',
    formPayload: {},
    expectedBody: { fromStatus: 'approved', toStatus: 'cancelled' }
  },
  {
    action: 'reinstate',
    heading: 'Reinstate registration',
    warningText:
      'This action must only be taken where a cancellation has been overturned by the required legal process (for example a successful appeal through the courts) and following instruction from an industry regulator. Reinstating restores the registration to approved from the date of reinstatement: the operator is registered for this site and material again and reporting obligations resume. A cancelled accreditation is not reinstated automatically and must be reinstated separately',
    buttonText: 'Reinstate now',
    fallbackError:
      'There was a problem reinstating the registration. Please try again.',
    formPayload: {},
    expectedBody: { fromStatus: 'cancelled', toStatus: 'approved' }
  }
]

describe('registration-status-transition', () => {
  const backendUrl = config.get('eprBackendUrl')
  const organisationId = 'aaa111bbb222ccc333ddd4444'
  const registrationId = 'eee555fff666ggg777hhh8888'
  const overviewUrl = `/organisations/${organisationId}/registrations/${registrationId}/overview`
  const backendStatusHistoryUrl = `${backendUrl}/v1/organisations/${organisationId}/registrations/${registrationId}/status-history`

  const readOnlySession = { ...mockUserSession, scopes: ['admin.read'] }

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

  const stubOverview = (status = 'approved') =>
    mswServer.use(
      http.get(
        `${backendUrl}/v1/organisations/${organisationId}/overview`,
        () =>
          HttpResponse.json({
            id: organisationId,
            companyName: 'ACME Ltd',
            registrations: [
              {
                id: registrationId,
                status,
                processingType: 'reprocessor',
                material: 'plastic',
                site: 'Site 1',
                accreditation: null
              }
            ]
          })
      )
    )

  const stubCalendarAndSummaryLogs = () => {
    mswServer.use(
      http.get(
        `${backendUrl}/v1/organisations/${organisationId}/registrations/${registrationId}/reports/calendar`,
        () => HttpResponse.json({ cadence: 'monthly', reportingPeriods: [] })
      ),
      http.get(
        `${backendUrl}/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        () => HttpResponse.json({ summaryLogs: [] })
      )
    )
  }

  const stubTransitionSuccess = (targetStatus, receivedBodies = []) =>
    mswServer.use(
      http.post(backendStatusHistoryUrl, async ({ request }) => {
        receivedBodies.push(await request.json())
        return HttpResponse.json({ status: targetStatus })
      })
    )

  const stubTransitionFailure = (status = 422) =>
    mswServer.use(
      http.post(backendStatusHistoryUrl, () =>
        HttpResponse.json(
          {
            message:
              'This transition is not permitted for the current registration status'
          },
          { status }
        )
      )
    )

  const stubTransitionFailureWithoutMessage = (status = 400) =>
    mswServer.use(
      http.post(backendStatusHistoryUrl, () =>
        HttpResponse.json({ error: 'Bad request' }, { status })
      )
    )

  const writeAuth = { strategy: 'session', credentials: mockUserSession }
  const readAuth = { strategy: 'session', credentials: readOnlySession }

  const postTransition = async (
    action,
    formPayload = {},
    payloadOverrides = {}
  ) => {
    const confirmUrl = `/organisations/${organisationId}/registrations/${registrationId}/${action}/confirm`
    const postUrl = `/organisations/${organisationId}/registrations/${registrationId}/${action}`
    const { cookie, crumb } = await getCsrfToken(server, confirmUrl, writeAuth)
    const postResponse = await server.inject({
      method: 'POST',
      url: postUrl,
      auth: writeAuth,
      headers: { cookie },
      payload: { crumb, ...formPayload, ...payloadOverrides }
    })
    const postCookies = [postResponse.headers['set-cookie']]
      .flat()
      .filter(Boolean)
    const redirectCookie = postCookies.length
      ? postCookies.map((c) => c.split(';')[0]).join('; ')
      : cookie
    return { postResponse, redirectCookie }
  }

  const expectOverviewFlash = async (redirectCookie, message) => {
    stubOverview()
    stubCalendarAndSummaryLogs()
    const { result } = await server.inject({
      method: 'GET',
      url: overviewUrl,
      headers: { cookie: redirectCookie },
      auth: writeAuth
    })
    const $ = cheerio.load(result)
    expect($('.govuk-error-summary').text()).toContain(message)
  }

  describe.each(TRANSITION_CASES)(
    '$action',
    ({
      action,
      heading,
      warningText,
      buttonText,
      fallbackError,
      formPayload,
      expectedBody
    }) => {
      const confirmUrl = `/organisations/${organisationId}/registrations/${registrationId}/${action}/confirm`
      const postUrl = `/organisations/${organisationId}/registrations/${registrationId}/${action}`

      test('confirm page is rejected with 401 when unauthenticated', async () => {
        const { statusCode } = await server.inject({
          method: 'GET',
          url: confirmUrl
        })
        expect(statusCode).toBe(statusCodes.unauthorised)
      })

      test('confirm page returns 403 for a read-only admin', async () => {
        vi.mocked(getUserSession).mockResolvedValue(readOnlySession)
        const { statusCode } = await server.inject({
          method: 'GET',
          url: confirmUrl,
          auth: readAuth
        })
        expect(statusCode).toBe(statusCodes.forbidden)
      })

      test(`confirm page renders the warning copy verbatim with ${buttonText} and Cancel actions`, async () => {
        vi.mocked(getUserSession).mockResolvedValue(mockUserSession)

        const { result, statusCode } = await server.inject({
          method: 'GET',
          url: confirmUrl,
          auth: writeAuth
        })

        expect(statusCode).toBe(statusCodes.ok)
        const $ = cheerio.load(result)
        expect($('h1').text().trim()).toBe(heading)
        expect(result).toContain(warningText)
        expect($('form').attr('action')).toBe(postUrl)
        expect($(`button:contains("${buttonText}")`)).toHaveLength(1)
        expect($('a:contains("Cancel")').attr('href')).toBe(overviewUrl)
      })

      test('POST is rejected with 401 when unauthenticated', async () => {
        const { statusCode } = await server.inject({
          method: 'POST',
          url: postUrl
        })
        expect(statusCode).toBe(statusCodes.unauthorised)
      })

      test('POST is rejected with 403 for a read-only admin', async () => {
        vi.mocked(getUserSession).mockResolvedValue(readOnlySession)
        const { cookie, crumb } = await getCsrfToken(
          server,
          confirmUrl,
          readAuth
        )
        const { statusCode } = await server.inject({
          method: 'POST',
          url: postUrl,
          auth: readAuth,
          headers: { cookie },
          payload: { crumb }
        })
        expect(statusCode).toBe(statusCodes.forbidden)
      })

      test(`successful ${action} posts the from/to transition to the backend status-history endpoint and redirects to the overview`, async () => {
        vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
        const receivedBodies = []
        stubTransitionSuccess(expectedBody.toStatus, receivedBodies)

        const { postResponse } = await postTransition(action, formPayload)
        expect(postResponse.statusCode).toBe(statusCodes.found)
        expect(postResponse.headers.location).toBe(overviewUrl)
        expect(receivedBodies).toEqual([expectedBody])
      })

      test(`failed ${action} when the backend is unreachable falls back to the generic flash error`, async () => {
        vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
        mswServer.use(
          http.post(backendStatusHistoryUrl, () => HttpResponse.error())
        )

        const { postResponse, redirectCookie } = await postTransition(
          action,
          formPayload
        )
        expect(postResponse.statusCode).toBe(statusCodes.found)
        expect(postResponse.headers.location).toBe(overviewUrl)

        await expectOverviewFlash(redirectCookie, fallbackError)
      })
    }
  )

  describe.each(TRANSITION_CASES.filter((c) => !c.hasGrantFields))(
    '$action backend rejection',
    ({ action, fallbackError }) => {
      test('redirects to the overview and shows the backend message as a flash error', async () => {
        vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
        stubTransitionFailure()

        const { postResponse, redirectCookie } = await postTransition(action)
        expect(postResponse.statusCode).toBe(statusCodes.found)
        expect(postResponse.headers.location).toBe(overviewUrl)

        await expectOverviewFlash(
          redirectCookie,
          'This transition is not permitted for the current registration status'
        )
      })

      test('without a backend message falls back to a generic flash error', async () => {
        vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
        stubTransitionFailureWithoutMessage()

        const { postResponse, redirectCookie } = await postTransition(action)
        expect(postResponse.statusCode).toBe(statusCodes.found)
        expect(postResponse.headers.location).toBe(overviewUrl)

        await expectOverviewFlash(redirectCookie, fallbackError)
      })

      test('with a non-object error body falls back to the generic flash error', async () => {
        vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
        mswServer.use(
          http.post(backendStatusHistoryUrl, () =>
            HttpResponse.json(null, { status: 422 })
          )
        )

        const { postResponse, redirectCookie } = await postTransition(action)
        expect(postResponse.statusCode).toBe(statusCodes.found)
        expect(postResponse.headers.location).toBe(overviewUrl)

        await expectOverviewFlash(redirectCookie, fallbackError)
      })
    }
  )

  describe('approve grant fields', () => {
    const confirmUrl = `/organisations/${organisationId}/registrations/${registrationId}/approve/confirm`
    const postUrl = `/organisations/${organisationId}/registrations/${registrationId}/approve`
    const fallbackError =
      'There was a problem approving the registration. Please try again.'

    const validFormPayload = {
      'validFrom-day': '1',
      'validFrom-month': '8',
      'validFrom-year': '2026',
      registrationNumber: 'REG999999'
    }

    const postApprove = async (payloadOverrides) => {
      const { cookie, crumb } = await getCsrfToken(
        server,
        confirmUrl,
        writeAuth
      )
      return server.inject({
        method: 'POST',
        url: postUrl,
        auth: writeAuth,
        headers: { cookie },
        payload: { crumb, ...validFormPayload, ...payloadOverrides }
      })
    }

    test('confirm page renders the valid from date input and the registration number field', async () => {
      vi.mocked(getUserSession).mockResolvedValue(mockUserSession)

      const { result } = await server.inject({
        method: 'GET',
        url: confirmUrl,
        auth: writeAuth
      })

      const $ = cheerio.load(result)
      expect($('input[name="validFrom-day"]')).toHaveLength(1)
      expect($('input[name="validFrom-month"]')).toHaveLength(1)
      expect($('input[name="validFrom-year"]')).toHaveLength(1)
      expect($('input[name="validTo-day"]')).toHaveLength(0)
      expect($('input[name="registrationNumber"]')).toHaveLength(1)
      const legends = $('legend').text()
      expect(legends).toContain('Valid from')
      expect(legends).not.toContain('Valid to')
    })

    test('confirm page leaves valid from empty with no default', async () => {
      vi.mocked(getUserSession).mockResolvedValue(mockUserSession)

      const { result } = await server.inject({
        method: 'GET',
        url: confirmUrl,
        auth: writeAuth
      })

      const $ = cheerio.load(result)
      expect($('input[name="validFrom-day"]').val()).toBe('')
      expect($('input[name="validFrom-month"]').val()).toBe('')
      expect($('input[name="validFrom-year"]').val()).toBe('')
    })

    test('reject confirm page does not render the grant fields', async () => {
      vi.mocked(getUserSession).mockResolvedValue(mockUserSession)

      const { result } = await server.inject({
        method: 'GET',
        url: `/organisations/${organisationId}/registrations/${registrationId}/reject/confirm`,
        auth: writeAuth
      })

      const $ = cheerio.load(result)
      expect($('input[name="validFrom-day"]')).toHaveLength(0)
      expect($('input[name="registrationNumber"]')).toHaveLength(0)
    })

    test('missing registration number re-renders the page with an error, preserving the date', async () => {
      vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
      const receivedBodies = []
      stubTransitionSuccess('approved', receivedBodies)

      const response = await postApprove({ registrationNumber: '  ' })

      expect(response.statusCode).toBe(statusCodes.badRequest)
      const $ = cheerio.load(response.result)
      expect($('.govuk-error-summary').text()).toContain(
        'Enter a registration number'
      )
      expect($('input[name="validFrom-day"]').attr('value')).toBe('1')
      expect($('input[name="validFrom-year"]').attr('value')).toBe('2026')
      expect(receivedBodies).toEqual([])
    })

    test.each([
      ['a missing day', { 'validFrom-day': '' }],
      ['a non-numeric month', { 'validFrom-month': 'August' }],
      ['a month past December', { 'validFrom-month': '13' }],
      ['a two-digit year', { 'validFrom-year': '26' }],
      ['an impossible date', { 'validFrom-month': '2', 'validFrom-day': '30' }]
    ])(
      'an invalid valid from date (%s) re-renders the page with an error, preserving the number',
      async (_label, payloadOverrides) => {
        vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
        const receivedBodies = []
        stubTransitionSuccess('approved', receivedBodies)

        const response = await postApprove(payloadOverrides)

        expect(response.statusCode).toBe(statusCodes.badRequest)
        const $ = cheerio.load(response.result)
        expect($('.govuk-error-summary').text()).toContain(
          'Enter the date the registration is valid from'
        )
        expect($('.govuk-error-summary a').attr('href')).toBe('#valid-from-day')
        expect($('input[name="registrationNumber"]').attr('value')).toBe(
          'REG999999'
        )
        expect(receivedBodies).toEqual([])
      }
    )

    test('missing every field lists both errors in field order', async () => {
      vi.mocked(getUserSession).mockResolvedValue(mockUserSession)

      const response = await postApprove({
        'validFrom-day': '',
        'validFrom-month': '',
        'validFrom-year': '',
        registrationNumber: ''
      })

      expect(response.statusCode).toBe(statusCodes.badRequest)
      const $ = cheerio.load(response.result)
      const summary = $('.govuk-error-summary').text()
      expect(summary).toContain('Enter the date the registration is valid from')
      expect(summary).toContain('Enter a registration number')
      expect(
        $('.govuk-error-summary a')
          .toArray()
          .map((a) => a.attribs.href)
      ).toEqual(['#valid-from-day', '#registration-number'])
    })

    test('a submission without any grant fields lists both errors in the summary', async () => {
      vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
      const { cookie, crumb } = await getCsrfToken(
        server,
        confirmUrl,
        writeAuth
      )

      const response = await server.inject({
        method: 'POST',
        url: postUrl,
        auth: writeAuth,
        headers: { cookie },
        payload: { crumb }
      })

      expect(response.statusCode).toBe(statusCodes.badRequest)
      const $ = cheerio.load(response.result)
      const summary = $('.govuk-error-summary').text()
      expect(summary).toContain('Enter the date the registration is valid from')
      expect(summary).toContain('Enter a registration number')
    })

    test('a backend rejection re-renders the page with the backend message, preserving input', async () => {
      vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
      mswServer.use(
        http.post(backendStatusHistoryUrl, () =>
          HttpResponse.json(
            { message: 'Registration number REG999999 is already in use' },
            { status: 422 }
          )
        )
      )

      const response = await postApprove()

      expect(response.statusCode).toBe(statusCodes.badRequest)
      const $ = cheerio.load(response.result)
      expect($('.govuk-error-summary').text()).toContain(
        'Registration number REG999999 is already in use'
      )
      expect($('input[name="validFrom-day"]').attr('value')).toBe('1')
      expect($('input[name="validFrom-month"]').attr('value')).toBe('8')
      expect($('input[name="validFrom-year"]').attr('value')).toBe('2026')
      expect($('input[name="registrationNumber"]').attr('value')).toBe(
        'REG999999'
      )
    })

    test('a backend rejection without a message re-renders the page with the generic error', async () => {
      vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
      stubTransitionFailureWithoutMessage()

      const response = await postApprove()

      expect(response.statusCode).toBe(statusCodes.badRequest)
      const $ = cheerio.load(response.result)
      expect($('.govuk-error-summary').text()).toContain(
        'There was a problem approving the registration. Please try again.'
      )
    })

    test('a non-object backend error body falls back to the generic flash error', async () => {
      vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
      mswServer.use(
        http.post(backendStatusHistoryUrl, () =>
          HttpResponse.json(null, { status: 422 })
        )
      )

      const response = await postApprove()

      expect(response.statusCode).toBe(statusCodes.badRequest)
      const $ = cheerio.load(response.result)
      expect($('.govuk-error-summary').text()).toContain(fallbackError)
    })

    test('a backend 5xx failure redirects to the overview with the generic flash error', async () => {
      vi.mocked(getUserSession).mockResolvedValue(mockUserSession)
      stubTransitionFailure(statusCodes.internalServerError)

      const { postResponse, redirectCookie } = await postTransition(
        'approve',
        validFormPayload
      )
      expect(postResponse.statusCode).toBe(statusCodes.found)
      expect(postResponse.headers.location).toBe(overviewUrl)

      await expectOverviewFlash(redirectCookie, fallbackError)
    })
  })
})
