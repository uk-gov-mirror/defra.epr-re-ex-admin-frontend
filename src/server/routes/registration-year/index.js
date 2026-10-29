import { accreditationParams } from '#server/common/helpers/natural-keys/accreditation-params.js'
import {
  accreditedYearGETController,
  registeredOnlyYearGETController,
  registrationYearRedirectController
} from './controller.get.js'

export const registrationYear = {
  plugin: {
    name: 'registrationYear',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/organisations/{organisationNumber}/registrations/{registrationNumber}/accreditations/{year}',
          ...accreditedYearGETController,
          options: {
            app: { pageTitle: 'Accredited year' },
            validate: { params: accreditationParams }
          }
        },
        {
          method: 'GET',
          path: '/organisations/{organisationNumber}/registrations/{registrationNumber}/registered-only/{year}',
          ...registeredOnlyYearGETController,
          options: {
            app: { pageTitle: 'Registered-only year' },
            validate: { params: accreditationParams }
          }
        },
        {
          method: 'GET',
          path: '/organisations/{organisationNumber}/registrations/{registrationNumber}/years/{year}',
          ...registrationYearRedirectController,
          options: {
            validate: { params: accreditationParams }
          }
        }
      ])
    }
  }
}
