-- Las búsquedas parciales usan ILIKE sobre título y nombre de autor.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE INDEX "proyecto_titulo_trgm_idx"
  ON "proyecto" USING GIN ("titulo" gin_trgm_ops);

CREATE INDEX "usuario_administrativo_nombre_trgm_idx"
  ON "usuario_administrativo" USING GIN ("nombre" gin_trgm_ops);
