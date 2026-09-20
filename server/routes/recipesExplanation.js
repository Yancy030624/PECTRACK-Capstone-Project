// ============================================================================
// PECTRACK API — routes/recipes.js (annotated for learning)
// Doughs and how products pack onto them — Phase 9A, Decisions 4 and 8 of
// RULES-PLANS/PHASE9A_DATA_FOUNDATION_PLAN.md. Mounted at /api/recipes.
//
// The bakery confirmed the shape: "Broas 1 Gallon", "Broas Pack" and
// "Broas Plate" are ONE dough packed three ways. So a recipe is a dough —
// ingredient quantities for one batch, and a yield in a base unit of its
// own choosing (pieces, grams, trays) — and a product carries
// `recipe_id` plus `units_per_item`, how many of those base units one
// sellable item holds. That pair lives on products and is edited from
// routes/products.js, not here; this router only reads it back so the
// recipe screen can show which products a dough becomes.
//
// Routes:
//   GET /            active recipes with line and product counts and a
//                    theoretical batch cost at today's average ingredient
//                    costs (SUM(quantity × average_unit_cost) in SQL).
//   GET /:id         the recipe, its lines, and its mapped products with a
//                    theoretical unit cost each (cost per base unit ×
//                    units_per_item). These are previews — the real cost
//                    of a product is fixed per approved batch.
//   POST /, PUT /:id create, or replace the whole recipe (name, unit,
//                    yield, all lines) in one transaction. There is no
//                    per-line endpoint on purpose: a recipe is edited as a
//                    whole, and an approved batch already snapshots the
//                    quantities it used, so changing the recipe never
//                    rewrites history (the same reason order_details keeps
//                    unit_price).
//   PATCH /:id       { isActive } only. Deactivating blocks new batches;
//                    products keep their mapping and old batches keep
//                    their record.
//
// validateRecipeBody refuses an empty line list, a duplicated ingredient,
// and any ingredient that does not exist or is deactivated. ADMIN writes;
// ADMIN and CASHIER read (the production screen needs the list).
// ============================================================================
// The live implementation is server/routes/recipes.js, commented in place.
// Every rule above sits next to the line that enforces it; it is not
// copied here.
