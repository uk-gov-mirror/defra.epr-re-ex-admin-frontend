import {
  isAccredited,
  registeredYears,
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
