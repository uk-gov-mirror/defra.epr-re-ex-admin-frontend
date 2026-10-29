import inert from '@hapi/inert'

import { home } from './routes/home/index.js'
import { organisations } from './routes/organisations/index.js'
import { organisation } from './routes/organisation/index.js'
import { organisationOverview } from './routes/organisation-overview/index.js'
import { registrationOverview } from './routes/registration-overview/index.js'
import { registrationYear } from './routes/registration-year/index.js'
import { reports } from './routes/reports/index.js'
import { health } from './routes/health/index.js'
import { auth } from './routes/auth/index.js'
import { defraFormsSubmission } from './routes/defra-forms-submission/index.js'
import { systemLogs } from './routes/system-logs/index.js'
import { publicRegister } from './routes/public-register/index.js'
import { tonnageMonitoring } from './routes/tonnage-monitoring/index.js'
import { prnTonnage } from './routes/prn-tonnage/index.js'
import { wasteBalanceAvailability } from './routes/waste-balance-availability/index.js'
import { linkedOrganisations } from './routes/linked-organisations/index.js'
import { prnActivity } from './routes/prn-activity/index.js'
import { prnCancel } from './routes/prn-cancel/index.js'
import { summaryLogUploadsReport } from './routes/summary-log/index.js'
import { summaryLogDocument } from './routes/summary-log-document/index.js'
import { summaryLogFile } from './routes/summary-log-file/index.js'
import { orsUpload } from './routes/ors-upload/index.js'
import { reportSubmissions } from './routes/report-submissions/index.js'
import { wasteRecordsExport } from './routes/waste-records-export/index.js'
import { queueManagement } from './routes/queue-management/index.js'
import { reportUnsubmit } from './routes/report-unsubmit/index.js'
import { wasteBalanceEvents } from './routes/waste-balance-events/index.js'
import { unlinkOrganisation } from './routes/unlink-organisation/index.js'
import { accreditationOverseasSites } from './routes/accreditation-overseas-sites/index.js'
import { creditedTonnage } from './routes/credited-tonnage/index.js'
import { accreditationStatusTransition } from './routes/accreditation-status-transition/index.js'
import { registrationStatusTransition } from './routes/registration-status-transition/index.js'

import { naturalKeyRedirect } from './common/helpers/natural-keys/natural-key-redirect.js'
import { serveStaticFiles } from './common/helpers/serve-static-files.js'
import { FEATURE_FLAGS } from './common/helpers/feature-flags.js'

export const router = {
  plugin: {
    name: 'router',
    async register(server) {
      await server.register([inert])

      server.ext('onPostAuth', naturalKeyRedirect)

      await server.register([health])

      // These are the routes containing our application logic
      // Some routes contain nested routes
      await server.register([
        home,
        organisations,
        organisation,
        organisationOverview,
        registrationOverview,
        registrationYear,
        reports,
        auth,
        defraFormsSubmission,
        systemLogs,
        publicRegister,
        tonnageMonitoring,
        prnTonnage,
        wasteBalanceAvailability,
        linkedOrganisations,
        prnActivity,
        ...(FEATURE_FLAGS.prnAdminCancellation ? [prnCancel] : []),
        summaryLogUploadsReport,
        summaryLogDocument,
        summaryLogFile,
        orsUpload,
        reportSubmissions,
        wasteRecordsExport,
        queueManagement,
        reportUnsubmit,
        wasteBalanceEvents,
        unlinkOrganisation,
        accreditationOverseasSites,
        creditedTonnage,
        accreditationStatusTransition,
        registrationStatusTransition
      ])

      await server.register([serveStaticFiles])
    }
  }
}
