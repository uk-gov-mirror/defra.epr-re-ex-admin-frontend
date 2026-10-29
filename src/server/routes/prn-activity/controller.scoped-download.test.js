import { vi, describe, test, expect, beforeEach } from 'vitest'
import Boom from '@hapi/boom'

import { prnActivityScopedDownloadController } from './controller.scoped-download.js'
import { fetchJsonFromBackend } from '#server/common/helpers/fetch-json-from-backend.js'

vi.mock('#server/common/helpers/fetch-json-from-backend.js', () => ({
  fetchJsonFromBackend: vi.fn()
}))

/** A PRN as the backend serves it under its accreditation. */
const mockPrn = {
  id: 'prn-1',
  prnNumber: 'PRN-001',
  status: { current: 'awaiting_acceptance', timeline: [] },
  issuedToOrganisation: { id: 'org-a', name: 'Org A' },
  issuer: {
    organisationNumber: '500123',
    name: 'Reprocessor Ltd',
    registration: {
      registrationNumber: 'R26ER5001180041PL',
      accreditation: {
        accreditationNumber: 'ACC-2025-001',
        accreditationYear: 2025,
        wasteProcessingType: 'reprocessor',
        material: 'glass_re_melt',
        submittedToRegulator: { code: 'ea' }
      }
    }
  },
  tonnage: 100,
  processToBeUsed: 'R5',
  isDecemberWaste: true,
  obligationYear: 2026,
  createdAt: '2025-06-01T10:00:00.000Z',
  issued: {
    at: '2025-06-15T10:30:00.000Z',
    by: { name: 'John', position: 'Manager' }
  },
  regulatorCancellable: true
}

const mockFetchJsonFromBackend = vi.mocked(fetchJsonFromBackend)

describe('prn-activity scoped download controller', () => {
  let request
  let h
  let responseBuilder

  beforeEach(() => {
    vi.clearAllMocks()

    request = {
      params: {
        organisationNumber: '500123',
        registrationNumber: 'R26ER5001180041PL',
        year: '2025'
      },
      yar: { set: vi.fn() }
    }

    responseBuilder = { header: vi.fn().mockReturnThis() }
    h = {
      response: vi.fn().mockReturnValue(responseBuilder),
      redirect: vi.fn().mockReturnValue('redirect-response')
    }
  })

  test("Should fetch the accreditation's PRNs by its natural keys, leaving out drafts and discarded PRNs", async () => {
    mockFetchJsonFromBackend.mockResolvedValue({ items: [] })

    await prnActivityScopedDownloadController.handler(request, h)

    expect(fetchJsonFromBackend).toHaveBeenCalledWith(
      request,
      '/organisations/500123/registrations/R26ER5001180041PL/accreditations/2025/packaging-recycling-notes?statuses=awaiting_authorisation,awaiting_acceptance,accepted,awaiting_cancellation,cancelled'
    )
  })

  test('Should generate a headers-only CSV when the backend returns no payload', async () => {
    mockFetchJsonFromBackend.mockResolvedValue(null)

    await prnActivityScopedDownloadController.handler(request, h)

    const csvContent = h.response.mock.calls[0][0]
    expect(csvContent).toContain('PRN Number')
    expect(csvContent).not.toContain('PRN-001')
  })

  test('Should write each PRN as a CSV row and set an accreditation-scoped filename', async () => {
    mockFetchJsonFromBackend.mockResolvedValue({ items: [mockPrn] })

    await prnActivityScopedDownloadController.handler(request, h)

    const csvContent = h.response.mock.calls[0][0]
    const [, dataLine] = csvContent.split('\n')
    expect(dataLine).toBe(
      'PRN-001,awaiting_acceptance,Org A,100,glass,R5,Yes,15/06/2025,John,Manager,ACC-2025-001,2025,2026,ea,Reprocessor Ltd,reprocessor'
    )
    expect(responseBuilder.header).toHaveBeenCalledWith(
      'Content-Type',
      'text/csv'
    )
    expect(responseBuilder.header).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="prn-activity-R26ER5001180041PL-2025.csv"'
    )
  })

  test('Should write other materials as the backend names them', async () => {
    const plasticPrn = structuredClone(mockPrn)
    plasticPrn.issuer.registration.accreditation.material = 'plastic'
    mockFetchJsonFromBackend.mockResolvedValue({ items: [plasticPrn] })

    await prnActivityScopedDownloadController.handler(request, h)

    const [, dataLine] = h.response.mock.calls[0][0].split('\n')
    expect(dataLine).toContain(',100,plastic,')
  })

  test('Should write the PRNs oldest first', async () => {
    mockFetchJsonFromBackend.mockResolvedValue({
      items: [
        {
          ...mockPrn,
          prnNumber: 'PRN-NEW',
          createdAt: '2025-07-01T10:00:00.000Z'
        },
        {
          ...mockPrn,
          prnNumber: 'PRN-OLD',
          createdAt: '2025-05-01T10:00:00.000Z'
        }
      ]
    })

    await prnActivityScopedDownloadController.handler(request, h)

    const [, first, second] = h.response.mock.calls[0][0].split('\n')
    expect(first).toMatch(/^PRN-OLD,/)
    expect(second).toMatch(/^PRN-NEW,/)
  })

  test('Should leave issue columns blank for a PRN that has not been issued', async () => {
    mockFetchJsonFromBackend.mockResolvedValue({
      items: [{ ...mockPrn, prnNumber: undefined, issued: undefined }]
    })

    await prnActivityScopedDownloadController.handler(request, h)

    const [, dataLine] = h.response.mock.calls[0][0].split('\n')
    expect(dataLine).toContain(',Yes,,,,ACC-2025-001,')
  })

  test('Should redirect to the accredited year page with a flash error on failure', async () => {
    mockFetchJsonFromBackend.mockRejectedValue(new Error('Network error'))

    const result = await prnActivityScopedDownloadController.handler(request, h)

    expect(request.yar.set).toHaveBeenCalledWith(
      'error',
      'There was a problem downloading the PRN activity data. Please try again.'
    )
    expect(h.redirect).toHaveBeenCalledWith(
      '/organisations/500123/registrations/R26ER5001180041PL/accreditations/2025'
    )
    expect(result).toBe('redirect-response')
  })

  test('Should use the backend error message when available', async () => {
    mockFetchJsonFromBackend.mockRejectedValue(
      Boom.badRequest('Custom backend error message')
    )

    await prnActivityScopedDownloadController.handler(request, h)

    expect(request.yar.set).toHaveBeenCalledWith(
      'error',
      'Custom backend error message'
    )
  })
})
