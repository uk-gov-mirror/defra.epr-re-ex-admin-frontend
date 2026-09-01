import { postStatusTransition } from '#server/common/helpers/status-transition/post-status-transition.js'
import { statusCodes } from '#server/common/constants/status-codes.js'
import { buildConfirmView } from './confirm-view.js'
import { parseGrantForm } from './grant-form.js'

/** @import {RegistrationStatusTransition} from './transitions.js' */
/** @import {GrantFormValues} from './grant-form.js' */

const CONFIRM_VIEW = 'routes/registration-status-transition/confirm'

/**
 * Builds the POST controller for a status transition action. Posts the
 * transition's from/to statuses (plus grant fields where the transition
 * collects them) to the backend status-history endpoint and redirects to the
 * registration overview, flashing any backend error. Invalid grant fields —
 * and backend rejections of them — re-render the confirm page with an error
 * summary instead.
 * @param {string} action - URL action segment (e.g. 'approve')
 * @param {RegistrationStatusTransition} transition
 */
export const createTransitionPostController = (action, transition) => ({
  async handler(request, h) {
    const { organisationId, registrationId } = request.params
    const overviewUrl = `/organisations/${organisationId}/registrations/${registrationId}/overview`

    /** @type {{ fromStatus: string, toStatus: string, validFrom?: string, registrationNumber?: string }} */
    const body = {
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus
    }

    /** @type {GrantFormValues | undefined} */
    let grantValues

    if (transition.hasGrantFields) {
      const { values, errors, validFrom } = parseGrantForm(request.payload)
      grantValues = values

      if (errors) {
        return h
          .view(
            CONFIRM_VIEW,
            buildConfirmView(action, transition, request.params, {
              values,
              errors
            })
          )
          .code(statusCodes.badRequest)
      }

      body.validFrom = /** @type {string} */ (validFrom)
      body.registrationNumber = values.registrationNumber
    }

    const outcome = await postStatusTransition(
      request,
      `/v1/organisations/${organisationId}/registrations/${registrationId}/status-history`,
      body,
      transition,
      grantValues
    )

    if (outcome) {
      return h
        .view(
          CONFIRM_VIEW,
          buildConfirmView(action, transition, request.params, {
            values: grantValues,
            backendError: outcome.backendError
          })
        )
        .code(statusCodes.badRequest)
    }

    return h.redirect(overviewUrl)
  }
})
