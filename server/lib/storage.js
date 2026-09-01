// The one place that knows proof-of-delivery files live on local disk
// (PHASE7_PLAN.md, Decision 8). Every caller only ever sees a storage_key,
// never a filesystem path — swapping to S3 or Cloudinary later means
// changing this module and nothing else.
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
export async function saveProofFile(buffer, extension) {
  await fs.mkdir(uploadsDir, { recursive: true })
  const storageKey = `${crypto.randomUUID()}${extension}`
  await fs.writeFile(path.join(uploadsDir, storageKey), buffer)
  return storageKey
}

export function proofFilePath(storageKey) {
  return path.join(uploadsDir, storageKey)
}

// Removes a file this module wrote. Only ever called to clean up a file
// whose delivery_proofs row was refused after the bytes had already
// landed on disk — without it, a rejected upload leaves an orphan nothing
// references and nothing will ever collect. Deliberately forgiving: the
// caller is already handling a failure, and a missing file means the
// desired end state (no such file) is what we have.
export async function deleteProofFile(storageKey) {
  await fs.rm(path.join(uploadsDir, storageKey), { force: true })
}
