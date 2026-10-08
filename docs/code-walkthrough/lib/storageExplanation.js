// ============================================================================
// PECTRACK API — lib/storage.js (annotated for learning)
// The one place that knows uploaded files live on local disk — originally
// proof-of-delivery photos only (PHASE7_PLAN.md, Decision 8), and now
// product photos too (STOREFRONT_PLAN.md, Decision 5), through the exact
// same mechanism: a random UUID key, never a client-supplied name. Every
// caller only ever sees that storage_key, never a filesystem path —
// swapping to S3 or Cloudinary later means changing this module and
// nothing else. Deliberately tiny: three exported values total, none of
// them doing more than they need to.
//
// Renamed from saveProofFile/proofFilePath/deleteProofFile once a second
// caller appeared — those names described the mechanism as belonging to
// deliveries specifically, which a second, unrelated use disproved.
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
export async function saveFile(buffer, extension) {
  await fs.mkdir(uploadsDir, { recursive: true })
  const storageKey = `${crypto.randomUUID()}${extension}`
  await fs.writeFile(path.join(uploadsDir, storageKey), buffer)
  return storageKey
}

// The read-side mirror of the function above — turns a storage_key
// (already known to be a UUID this module generated) back into the
// absolute path saveFile() wrote it to, for a route to stream back with
// response.sendFile() — routes/deliveries.js for a proof photo,
// routes/products.js for a product photo.
export function filePath(storageKey) {
  return path.join(uploadsDir, storageKey)
}

// Removes a file this module wrote. Called to clean up a file whose
// database row was refused after the bytes had already landed on disk —
// the upload route has to write the file before it can know whether the
// row will be accepted — or to remove the OLD file when a product photo
// is deliberately replaced by a new one. Without this, every rejected or
// superseded upload leaks a file nothing references and nothing will ever
// collect.
//
// `force: true` makes a missing file a no-op rather than an error, which
// is right for a cleanup path: the caller is ALREADY handling a failure
// or a deliberate replacement, and "the file isn't there" is the exact
// end state it was asking for. Throwing here would replace a clean
// response with a 500.
export async function deleteFile(storageKey) {
  await fs.rm(path.join(uploadsDir, storageKey), { force: true })
}
