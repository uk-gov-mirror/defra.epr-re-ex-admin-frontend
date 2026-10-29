/**
 * @import { StatusTimeline } from '#server/common/helpers/fetch-organisation-view.js'
 */

const MS_PER_DAY = 86_400_000

/**
 * @param {string} date - YYYY-MM-DD
 * @returns {string}
 */
const dayBefore = (date) =>
  new Date(Date.parse(date) - MS_PER_DAY).toISOString().slice(0, 10)

/**
 * @param {string} date - YYYY-MM-DD
 * @returns {number}
 */
const yearOf = (date) => Number(date.slice(0, 4))

const HELD_ACCREDITATION_STATUSES = new Set(['approved', 'suspended'])

/**
 * The years a timeline was in one of `statuses` on at least one day up to
 * `today`, oldest first. A status holds until the day before the next change,
 * and the last of a day's changes is the day's status.
 * @param {StatusTimeline} timeline
 * @param {string} today - YYYY-MM-DD
 * @param {Set<string>} statuses
 * @returns {number[]}
 */
const yearsIn = (timeline, today, statuses) => {
  const days = [
    ...new Map(timeline.map(({ at, status }) => [at.slice(0, 10), status]))
  ]
    .filter(([date]) => date.localeCompare(today) <= 0)
    .sort(([a], [b]) => a.localeCompare(b))

  const years = new Set()
  days.forEach(([from, status], i) => {
    if (!statuses.has(status)) {
      return
    }
    const to = i + 1 < days.length ? dayBefore(days[i + 1][0]) : today
    for (let year = yearOf(from); year <= yearOf(to); year++) {
      years.add(year)
    }
  })

  return [...years].sort((a, b) => a - b)
}

/**
 * The years a timeline was `approved` on at least one day up to `today`,
 * oldest first, matching the backend's approved years.
 * @param {StatusTimeline} timeline
 * @param {string} today - YYYY-MM-DD
 * @returns {number[]}
 */
export const approvedYears = (timeline, today) =>
  yearsIn(timeline, today, new Set(['approved']))

/**
 * Whether an accreditation was approved or suspended on at least one day of
 * `year`, matching the backend's accredited windows. A created or rejected
 * accreditation was never held.
 * @param {StatusTimeline} timeline
 * @param {number} year
 * @returns {boolean}
 */
export const heldInYear = (timeline, year) =>
  yearsIn(timeline, `${year}-12-31`, HELD_ACCREDITATION_STATUSES).includes(year)

/**
 * Today's UTC date as YYYY-MM-DD.
 * @returns {string}
 */
export const utcToday = () => new Date().toISOString().slice(0, 10)

/**
 * The status a timeline ended `year` on, or the current status for this year
 * and later, or when the timeline starts after `year`.
 * @param {{ current: string, timeline: StatusTimeline }} status
 * @param {number} year
 * @param {string} today - YYYY-MM-DD
 * @returns {string}
 */
export const statusForYear = (status, year, today) => {
  if (year >= yearOf(today)) {
    return status.current
  }
  const endOfYear = `${year}-12-31`
  return (
    status.timeline.findLast(
      ({ at }) => at.slice(0, 10).localeCompare(endOfYear) <= 0
    )?.status ?? status.current
  )
}
