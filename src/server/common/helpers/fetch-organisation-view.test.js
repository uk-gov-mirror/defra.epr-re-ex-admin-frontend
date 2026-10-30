import { vi } from 'vitest'
import {
  accreditationFor,
  fetchOrganisationView,
  latestAccreditation,
  processingTypeOf,
  registrationIn,
  registrationRows,
  siteOf
} from './fetch-organisation-view.js'
import { fetchJsonFromBackend } from '#server/common/helpers/fetch-json-from-backend.js'

/** @import { Request } from '@hapi/hapi' */
/** @import { OrganisationView, RegistrationView } from './fetch-organisation-view.js' */

vi.mock('#server/common/helpers/fetch-json-from-backend.js', () => ({
  fetchJsonFromBackend: vi.fn()
}))

const mockRequest = /** @type {Request} */ ({})

/** @type {RegistrationView} */
const exporter = {
  material: 'paper',
  validFrom: '2026-01-01',
  status: { current: 'approved', timeline: [] },
  wasteProcessingType: 'exporter',
  accreditations: {}
}

/** @type {RegistrationView} */
const reprocessor = {
  material: 'plastic',
  validFrom: '2026-01-01',
  status: { current: 'cancelled', timeline: [] },
  wasteProcessingType: 'reprocessor',
  reprocessingType: 'input',
  site: {
    address: { line1: '1 Mill Lane', town: 'Leeds', postcode: 'LS1 1AA' }
  },
  accreditations: {
    2026: {
      accreditationNumber: 'A26ER5001180114PL',
      status: {
        current: 'approved',
        timeline: [{ at: '2026-01-01T00:00:00.000Z', status: 'approved' }]
      }
    }
  }
}

/**
 * @param {Record<string, RegistrationView>} registrations
 * @returns {OrganisationView}
 */
const organisationWith = (registrations) => ({
  name: 'ACME ltd',
  organisationNumber: '500123',
  registrations
})

describe(fetchOrganisationView, () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the organisation by its number, encoded once', async () => {
    const organisation = organisationWith({})
    vi.mocked(fetchJsonFromBackend).mockResolvedValue(organisation)

    const result = await fetchOrganisationView(mockRequest, 'FAKE/ORG')

    expect(fetchJsonFromBackend).toHaveBeenCalledWith(
      mockRequest,
      '/organisations/FAKE%2FORG',
      {}
    )
    expect(result).toBe(organisation)
  })
})

describe(registrationIn, () => {
  const organisation = organisationWith({ R26ER5001180041PL: exporter })

  it('returns the registration the organisation holds', () => {
    expect(registrationIn(organisation, 'R26ER5001180041PL')).toBe(exporter)
  })

  it.each(['R26ER9999999999PL', 'constructor'])(
    'is not found for %s, which the organisation does not hold',
    (registrationNumber) => {
      expect(() => registrationIn(organisation, registrationNumber)).toThrow(
        expect.objectContaining({
          isBoom: true,
          output: expect.objectContaining({ statusCode: 404 }),
          code: 'registration_not_found',
          event: {
            action: 'fetch_registration',
            reason: `organisationNumber=500123 registrationNumber=${registrationNumber}`
          }
        })
      )
    }
  )
})

describe(latestAccreditation, () => {
  it('picks the latest year', () => {
    expect(
      latestAccreditation({
        ...reprocessor,
        accreditations: {
          2027: {
            accreditationNumber: 'A27ER5001180114PL',
            status: { current: 'suspended', timeline: [] }
          },
          2026: {
            accreditationNumber: 'A26ER5001180114PL',
            status: { current: 'approved', timeline: [] }
          }
        }
      })
    ).toStrictEqual({
      year: '2027',
      accreditationNumber: 'A27ER5001180114PL',
      status: 'suspended'
    })
  })

  it('is null when the registration has no accreditations', () => {
    expect(latestAccreditation(exporter)).toBeNull()
  })
})

describe(accreditationFor, () => {
  test("returns the year's accreditation with its current status", () => {
    expect(accreditationFor(reprocessor, '2026')).toEqual({
      year: '2026',
      accreditationNumber: 'A26ER5001180114PL',
      status: 'approved'
    })
  })

  test('returns null for a year without one', () => {
    expect(accreditationFor(reprocessor, '2025')).toBeNull()
  })

  test('returns null for an accreditation not approved or suspended', () => {
    expect(
      accreditationFor(
        {
          ...reprocessor,
          accreditations: {
            2025: {
              accreditationNumber: 'A25ER5001180114PL',
              status: { current: 'rejected', timeline: [] }
            }
          }
        },
        '2025'
      )
    ).toBeNull()
  })
})

describe(processingTypeOf, () => {
  it('names an exporter', () => {
    expect(processingTypeOf(exporter)).toBe('exporter')
  })

  it('names a reprocessor with its reprocessing type', () => {
    expect(processingTypeOf(reprocessor)).toBe('reprocessor - input')
  })
})

describe(siteOf, () => {
  it('reads the first line of a reprocessor address', () => {
    expect(siteOf(reprocessor)).toBe('1 Mill Lane')
  })

  it('reads a reprocessor address given in full', () => {
    expect(
      siteOf({
        ...reprocessor,
        site: { address: { fullAddress: '1 Mill Lane, Leeds, LS1 1AA' } }
      })
    ).toBe('1 Mill Lane, Leeds, LS1 1AA')
  })

  it('is null for an exporter', () => {
    expect(siteOf(exporter)).toBeNull()
  })
})

describe(registrationRows, () => {
  it('lists the registrations by number, whatever order they arrive in', () => {
    const rows = registrationRows(
      organisationWith({
        R26ER5001180042PL: reprocessor,
        R26ER5001180041PL: exporter
      })
    )

    expect(rows).toStrictEqual([
      {
        registrationNumber: 'R26ER5001180041PL',
        status: 'approved',
        processingType: 'exporter',
        material: 'paper',
        site: null,
        accreditation: null
      },
      {
        registrationNumber: 'R26ER5001180042PL',
        status: 'cancelled',
        processingType: 'reprocessor - input',
        material: 'plastic',
        site: '1 Mill Lane',
        accreditation: {
          year: '2026',
          accreditationNumber: 'A26ER5001180114PL',
          status: 'approved'
        }
      }
    ])
  })
})
