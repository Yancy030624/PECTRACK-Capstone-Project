// ============================================================================
// PECTRACK API — lib/storage.js (annotated for learning)
// The one place that knows proof-of-delivery files live on local disk
// (PHASE7_PLAN.md, Decision 8). Every caller only ever sees a storage_key,
// never a filesystem path — swapping to S3 or Cloudinary later means
// changing this module and nothing else. Deliberately tiny: three
// exported values total, none of them doing more than they need to.
// ============================================================================

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// server/lib/storage.js -> server/lib -> server -> repo root -> uploads.
// Resolved from THIS FILE'S OWN location (import.meta.url) rather than
// process.cwd() — the working directory a process was started from is not
// something this module should have to trust, and getting it wrong here
// would mean writing files to a different place depending on how the
// server happens to be launched.
const uploadsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'uploads')

// THE STORAGE KEY IS GENERATED HERE — a random UUID plus an extension the
// CALLER has already derived from a validated mime type (see Pattern G in
// routes/deliveries.js). This function never sees, and never trusts, a
// client-supplied file name. That is what makes the path-traversal
// protection real: nothing in this module ever builds a path out of
// request input — the one string that becomes a filename never
// originated on the other end of an HTTP request.
export async function saveProofFile(buffer, extension) {
  await fs.mkdir(uploadsDir, { recursive: true })
  const storageKey = `${crypto.randomUUID()}${extension}`
  await fs.writeFile(path.join(uploadsDir, storageKey), buffer)
  return storageKey
}

// The read-side mirror of the function above — turns a storage_key
// (already known to be a UUID this module generated) back into the
// absolute path saveProofFile wrote it to, for routes/deliveries.js to
// stream back with response.sendFile().
export function proofFilePath(storageKey) {
  return path.join(uploadsDir, storageKey)
}

// Removes a file this module wrote. Only ever called to clean up a file
// whose delivery_proofs row was refused after the bytes had already
// landed on disk — the upload route has to write the file before it can
// know whether the row will be accepted, so without this every rejected
// upload leaks a file nothing references and nothing will ever collect.
//
// `force: true` makes a missing file a no-op rather than an error, which
// is right for a cleanup path: the caller is ALREADY handling a failure,
// and "the file isn't there" is the exact end state it was asking for.
// Throwing here would replace a clean 409 with a 500.
export async function deleteProofFile(storageKey) {
  await fs.rm(path.join(uploadsDir, storageKey), { force: true })
}
