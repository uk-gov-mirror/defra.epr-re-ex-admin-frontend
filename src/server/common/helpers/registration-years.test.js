import {
  isAccredited,
  registeredYears,
  registrationYears,
  utcToday
} from './registration-years.js'

/** @import { RegistrationView } from './fetch-organisation-view.js' */

/**
 * @param {string} current
 * @param {{ at: string, status: string }[]} [timeline]
 * @param {RegistrationView['accreditations']} [accreditations]
 * @returns {RegistrationView}
 */
const registration = (current, timeline = [], accreditations = {}) => ({
  material: 'glass',
  wasteProcessingType: 'exporter',
  validFrom: '2024-03-01',
  status: { current, timeline },
  accreditations
})

describe('#utcToday', () => {
  test('is a calendar date', () => {
    expect(utcToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('#registeredYears', () => {
  const today = '2026-10-29'

  test('runs from validFrom to this year while approved', () => {
    expect(registeredYears(registration('approved'), today)).toEqual([
      2024, 2025, 2026
    ])
  })

  test('runs from validFrom to the year it was cancelled', () => {
    expect(
      registeredYears(
        registration('cancelled', [
          { at: '2024-03-01T00:00:00.000Z', status: 'approved' },
          { at: '2025-06-01T00:00:00.000Z', status: 'cancelled' }
        ]),
        today
      )
    ).toEqual([2024, 2025])
  })

  test('runs to this year for a cancellation without a timeline', () => {
    expect(registeredYears(registration('cancelled'), today)).toEqual([
      2024, 2025, 2026
    ])
  })

  test.each(['created', 'rejected'])(
    'has no years for a %s registration',
    (status) => {
      expect(registeredYears(registration(status), today)).toEqual([])
    }
  )
})

describe('#isAccredited', () => {
  /** @param {string} current */
  const accreditedIn2025 = (current) =>
    registration('approved', [], {
      2025: {
        accreditationNumber: 'ACC-25',
        status: { current, timeline: [] }
      }
    })

  test.each(['approved', 'suspended'])(
    'counts a %s accreditation',
    (status) => {
      expect(isAccredited(accreditedIn2025(status), '2025')).toBe(true)
    }
  )

  test.each(['created', 'rejected', 'cancelled'])(
    'does not count a %s accreditation',
    (status) => {
      expect(isAccredited(accreditedIn2025(status), 2025)).toBe(false)
    }
  )

  test.each(['2026', 'constructor'])(
    'does not count %s, which has no accreditation',
    (year) => {
      expect(isAccredited(accreditedIn2025('approved'), year)).toBe(false)
    }
  )
})

describe('#registrationYears', () => {
  const today = '2026-10-29'
  /**
   * @param {string} accreditationNumber
   * @param {string} current
   */
  const accreditation = (accreditationNumber, current) => ({
    accreditationNumber,
    status: { current, timeline: [] }
  })

  test('lists registered and accredited years newest first', () => {
    expect(
      registrationYears(
        registration('approved', [], {
          2026: accreditation('ACC-26', 'suspended'),
          2027: accreditation('ACC-27', 'approved')
        }),
        today
      )
    ).toEqual([
      {
        year: '2027',
        registrationStatus: 'approved',
        accreditation: { accreditationNumber: 'ACC-27', status: 'approved' }
      },
      {
        year: '2026',
        registrationStatus: 'approved',
        accreditation: { accreditationNumber: 'ACC-26', status: 'suspended' }
      },
      { year: '2025', registrationStatus: 'approved', accreditation: null },
      { year: '2024', registrationStatus: 'approved', accreditation: null }
    ])
  })

  test.each(['created', 'rejected', 'cancelled'])(
    'leaves out a %s accreditation',
    (status) => {
      expect(
        registrationYears(
          registration('approved', [], {
            2025: accreditation('ACC-25', status),
            2027: accreditation('ACC-27', status)
          }),
          today
        ).map(({ year, accreditation }) => [year, accreditation])
      ).toEqual([
        ['2026', null],
        ['2025', null],
        ['2024', null]
      ])
    }
  )

  test('lists no years for a registration never approved', () => {
    expect(registrationYears(registration('created'), today)).toEqual([])
  })
})
