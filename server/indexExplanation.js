// ============================================================================
// PECTRACK API — index.js (annotated for learning)
// The real entry point when you run `npm run server` or `npm start`. Kept
// deliberately tiny: all the actual app configuration lives in app.js (see
// appExplanation.js) so that file can be imported by tests without also
// starting a real server on the real PORT. This file's only job is the one
// thing tests should NOT do automatically: bind a port and start listening.
// ============================================================================

import { config } from './config.js'
import app from './app.js'

// Start listening for HTTP requests on the configured port. Everything
// that happens for each request (middleware, routing, error handling) was
// already wired up inside app.js — this line is the only thing that
// actually turns the configured app into a running server.
app.listen(config.port, () => console.log(`PECTRACK API listening on http://localhost:${config.port}`))
