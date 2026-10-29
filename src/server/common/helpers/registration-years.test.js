import {
  approvedYears,
  heldInYear,
  statusForYear,
  utcToday
} from './registration-years.js'

describe('#approvedYears', () => {
  const today = '2026-10-29'

  test('returns no years for an empty timeline', () => {
    expect(approvedYears([], today)).toEqual([])
  })

  test('runs an approval up to today', () => {
    expect(
      approvedYears(
        [{ at: '2024-03-01T00:00:00.000Z', status: 'approved' }],
        today
      )
    ).toEqual([2024, 2025, 2026])
  })

  test('ends an approval the day before the next change', () => {
    expect(
      approvedYears(
        [
          { at: '2024-03-01T00:00:00.000Z', status: 'approved' },
          { at: '2025-01-01T09:00:00.000Z', status: 'suspended' }
        ],
        today
      )
    ).toEqual([2024])
  })

  test('leaves out years spent wholly in another status', () => {
    expect(
      approvedYears(
        [
          { at: '2023-06-01T00:00:00.000Z', status: 'approved' },
          { at: '2023-12-01T00:00:00.000Z', status: 'cancelled' },
          { at: '2025-02-01T00:00:00.000Z', status: 'approved' }
        ],
        today
      )
    ).toEqual([2023, 2025, 2026])
  })

  test("takes the last of a day's changes as the day's status", () => {
    expect(
      approvedYears(
        [
          { at: '2025-01-01T09:00:00.000Z', status: 'approved' },
          { at: '2025-01-01T10:00:00.000Z', status: 'created' }
        ],
        today
      )
    ).toEqual([])
  })

  test('ignores changes after today', () => {
    expect(
      approvedYears(
        [{ at: '2027-01-01T00:00:00.000Z', status: 'approved' }],
        today
      )
    ).toEqual([])
  })
})

describe('#utcToday', () => {
  test('is a calendar date', () => {
    expect(utcToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('#statusForYear', () => {
  const today = '2026-10-29'
  const status = {
    current: 'suspended',
    timeline: [
      { at: '2024-03-01T00:00:00.000Z', status: 'approved' },
      { at: '2024-12-31T15:00:00.000Z', status: 'suspended' },
      { at: '2025-02-01T00:00:00.000Z', status: 'approved' },
      { at: '2026-05-01T00:00:00.000Z', status: 'suspended' }
    ]
  }

  test('is the status the year ended on', () => {
    expect(statusForYear(status, 2024, today)).toBe('suspended')
    expect(statusForYear(status, 2025, today)).toBe('approved')
  })

  test('is the current status for this year', () => {
    expect(statusForYear(status, 2026, today)).toBe('suspended')
  })

  test('is the current status before the first change', () => {
    expect(statusForYear(status, 2023, today)).toBe('suspended')
  })
})

describe('#heldInYear', () => {
  test.each(['approved', 'suspended'])('counts a year spent %s', (status) => {
    expect(heldInYear([{ at: '2025-06-01T00:00:00.000Z', status }], 2025)).toBe(
      true
    )
  })

  test.each(['created', 'rejected', 'cancelled'])(
    'does not count a year spent wholly %s',
    (status) => {
      expect(
        heldInYear([{ at: '2025-01-01T00:00:00.000Z', status }], 2025)
      ).toBe(false)
    }
  )

  test('counts a year approved on one day before cancelling', () => {
    expect(
      heldInYear(
        [
          { at: '2025-01-01T00:00:00.000Z', status: 'created' },
          { at: '2025-12-31T09:00:00.000Z', status: 'approved' },
          { at: '2026-01-01T09:00:00.000Z', status: 'cancelled' }
        ],
        2025
      )
    ).toBe(true)
  })

  test('does not count a year after the accreditation was cancelled', () => {
    expect(
      heldInYear(
        [
          { at: '2025-01-01T00:00:00.000Z', status: 'approved' },
          { at: '2025-12-01T00:00:00.000Z', status: 'cancelled' }
        ],
        2026
      )
    ).toBe(false)
  })
})
