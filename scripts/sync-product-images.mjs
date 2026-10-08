// Points each product in THIS database at its photo in uploads/products/.
//
// Product photos are tracked in git under readable names —
// uploads/products/<product-name>-<hash>.<ext>, e.g.
// cheese-monay-3f9a2c1b.jpg (server/lib/storage.js saveNamedFile) — but
// every machine has its own database, and a database restored, seeded, or
// simply older than the last pull can hold keys that no longer match the
// files. Run this after pulling and every product with a photo in the
// folder gets the right key:
//
//   npm run sync:images            (shows what it would change)
//   npm run sync:images -- --apply (changes it)
//
// For each product, by its name and variant:
//   - its current key's file exists                → left alone
//   - exactly one file in the folder has its name  → key set to that file
//   - none                                         → reported, left alone
//   - more than one                                → reported, left alone
//     (two versions of one photo; delete the stale one and run again)
import fs from 'node:fs/promises'
import { pool } from '../server/db.js'
import { filePath, slugify } from '../server/lib/storage.js'

const apply = process.argv.includes('--apply')
const folder = 'products'
const files = await fs.readdir(filePath(folder)).catch(() => [])
const exists = async (key) => fs.access(filePath(key)).then(() => true, () => false)

const products = (await pool.query(
  'SELECT product_id, product_name, variant, image_key FROM products ORDER BY product_name, variant NULLS FIRST',
)).rows

const changes = []
const missing = []
const ambiguous = []
for (const product of products) {
  if (product.image_key && await exists(product.image_key)) continue
  const name = slugify([product.product_name, product.variant].filter(Boolean).join(' '))
  const matches = files.filter((file) => new RegExp(`^${name}-[0-9a-f]{8}\\.(jpg|png|webp)$`).test(file))
  const label = `${product.product_name}${product.variant ? ` (${product.variant})` : ''}`
  if (matches.length === 1) changes.push({ id: product.product_id, label, key: `${folder}/${matches[0]}`, old: product.image_key })
  else if (matches.length === 0) missing.push(label)
  else ambiguous.push(`${label}: ${matches.join(', ')}`)
}

for (const change of changes) {
  console.log(`${apply ? 'set' : 'would set'}  ${change.label} → ${change.key}${change.old ? `  (was ${change.old}, file missing)` : ''}`)
  if (apply) await pool.query('UPDATE products SET image_key = $1 WHERE product_id = $2', [change.key, change.id])
}
if (missing.length) console.log(`\nNo photo in uploads/${folder}/ for: ${missing.join('; ')}`)
if (ambiguous.length) console.log(`\nMore than one photo — delete the stale one and run again:\n  ${ambiguous.join('\n  ')}`)
console.log(`\n${changes.length} product${changes.length === 1 ? '' : 's'} ${apply ? 'updated' : 'to update'}.${!apply && changes.length ? ' Run with --apply to save.' : ''}`)
await pool.end()
