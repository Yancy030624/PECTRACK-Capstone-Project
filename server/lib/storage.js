// The one place that knows uploaded files live on local disk — originally
// proof-of-delivery photos (PHASE7_PLAN.md, Decision 8), and now product
// photos too (STOREFRONT_PLAN.md, Decision 5), both through the identical
// mechanism: a random UUID key, never a client-supplied name. Every caller
// only ever sees that storage_key, never a filesystem path — swapping to
// S3 or Cloudinary later means changing this module and nothing else.
//
// Renamed from saveProofFile/proofFilePath/deleteProofFile when the second
// caller appeared — the old names described the mechanism as if it
// belonged to deliveries specifically, which stopped being true.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// server/lib/storage.js -> server/lib -> server -> repo root -> uploads.
// Resolved from this file's own location rather than process.cwd(), so it
// is correct regardless of which directory the process was started from.
const uploadsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'uploads')

// The storage key is generated HERE, from a random UUID plus an extension
// the CALLER has already derived from a validated mime type — this
// function never sees, and never trusts, a client-supplied file name. That
// is what makes Pattern G's path-traversal protection real: nothing in
// this module ever builds a path out of request input.
export async function saveFile(buffer, extension) {
  await fs.mkdir(uploadsDir, { recursive: true })
  const storageKey = `${crypto.randomUUID()}${extension}`
  await fs.writeFile(path.join(uploadsDir, storageKey), buffer)
  return storageKey
}

export function filePath(storageKey) {
  return path.join(uploadsDir, storageKey)
}

// Removes a file this module wrote. Called to clean up a file whose
// database row was refused after the bytes had already landed on disk
// (a rejected proof upload, or a product image being replaced) — without
// it, a rejected or superseded upload leaves an orphan nothing references
// and nothing will ever collect. Deliberately forgiving: the caller is
// already handling a failure or a deliberate replacement, and a missing
// file means the desired end state (no such file) is what we have.
export async function deleteFile(storageKey) {
  await fs.rm(path.join(uploadsDir, storageKey), { force: true })
}
