-- The thesis URL column already has the unique index `enlace_tesis_url_key`
-- from 20261108120000_thesis_links. Canonical URL normalization and the
-- transaction-scoped advisory lock are enforced by the API, so this migration
-- intentionally makes no additional schema change.
SELECT 1;
