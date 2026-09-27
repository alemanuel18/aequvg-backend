CREATE TABLE "categoria_recurso" (
  "id_categoria_recurso" SERIAL NOT NULL,
  "nombre" CITEXT NOT NULL,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "categoria_recurso_pkey" PRIMARY KEY ("id_categoria_recurso")
);

CREATE TABLE "enlace_recurso" (
  "id_enlace_recurso" SERIAL NOT NULL,
  "id_recurso" INTEGER NOT NULL,
  "etiqueta" VARCHAR(160) NOT NULL,
  "url" VARCHAR(2048) NOT NULL,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "enlace_recurso_pkey" PRIMARY KEY ("id_enlace_recurso")
);

INSERT INTO "categoria_recurso" ("nombre", "actualizado_en")
SELECT DISTINCT ON (LOWER(COALESCE(NULLIF(BTRIM("categoria"), ''), 'Sin categoría')))
  COALESCE(NULLIF(BTRIM("categoria"), ''), 'Sin categoría'), CURRENT_TIMESTAMP
FROM "recurso"
ORDER BY LOWER(COALESCE(NULLIF(BTRIM("categoria"), ''), 'Sin categoría')),
  COALESCE(NULLIF(BTRIM("categoria"), ''), 'Sin categoría');

ALTER TABLE "recurso" ADD COLUMN "id_categoria_recurso" INTEGER;
UPDATE "recurso" r SET "id_categoria_recurso" = c."id_categoria_recurso"
FROM "categoria_recurso" c
WHERE c."nombre" = COALESCE(NULLIF(BTRIM(r."categoria"), ''), 'Sin categoría');
ALTER TABLE "recurso" ALTER COLUMN "id_categoria_recurso" SET NOT NULL;

INSERT INTO "enlace_recurso" ("id_recurso", "etiqueta", "url")
SELECT "id_recurso", 'Enlace externo', "enlace_externo" FROM "recurso" WHERE "enlace_externo" IS NOT NULL;

ALTER TABLE "recurso" DROP CONSTRAINT "recurso_destino_check";
ALTER TABLE "recurso" DROP COLUMN "categoria", DROP COLUMN "enlace_externo";

CREATE UNIQUE INDEX "categoria_recurso_nombre_key" ON "categoria_recurso"("nombre");
CREATE INDEX "categoria_recurso_activa_nombre_idx" ON "categoria_recurso"("activa", "nombre");
CREATE UNIQUE INDEX "enlace_recurso_id_recurso_url_key" ON "enlace_recurso"("id_recurso", "url");
CREATE INDEX "enlace_recurso_id_recurso_orden_idx" ON "enlace_recurso"("id_recurso", "orden");
CREATE INDEX "recurso_id_categoria_recurso_estado_publicado_en_idx" ON "recurso"("id_categoria_recurso", "estado", "publicado_en");

ALTER TABLE "recurso" ADD CONSTRAINT "recurso_id_categoria_recurso_fkey" FOREIGN KEY ("id_categoria_recurso") REFERENCES "categoria_recurso"("id_categoria_recurso") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "enlace_recurso" ADD CONSTRAINT "enlace_recurso_id_recurso_fkey" FOREIGN KEY ("id_recurso") REFERENCES "recurso"("id_recurso") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "enlace_recurso" ADD CONSTRAINT "enlace_recurso_url_http_check" CHECK ("url" ~* '^https?://');
ALTER TABLE "enlace_recurso" ADD CONSTRAINT "enlace_recurso_orden_no_negativo_check" CHECK ("orden" >= 0);
ALTER TABLE "categoria_recurso" ADD CONSTRAINT "categoria_recurso_nombre_no_vacio_check" CHECK (BTRIM("nombre"::TEXT) <> '');

-- Conserva datos heredados antes de imponer la regla de publicación.
UPDATE "recurso" SET "publicado_en" = "creado_en"
WHERE "estado" = 'PUBLICADO' AND "publicado_en" IS NULL;
UPDATE "recurso" SET "publicado_en" = NULL
WHERE "estado" IN ('BORRADOR', 'ARCHIVADO') AND "publicado_en" IS NOT NULL;

ALTER TABLE "recurso" ADD CONSTRAINT "recurso_estado_publicacion_check" CHECK (
  ("estado" = 'PUBLICADO' AND "publicado_en" IS NOT NULL)
  OR ("estado" IN ('BORRADOR', 'ARCHIVADO') AND "publicado_en" IS NULL)
);

CREATE FUNCTION "recurso_publicado_destino_check"() RETURNS TRIGGER AS $$
DECLARE
  recurso_id INTEGER := COALESCE(NEW."id_recurso", OLD."id_recurso");
BEGIN
  IF EXISTS (
    SELECT 1 FROM "recurso" r
    WHERE r."id_recurso" = recurso_id
      AND r."estado" = 'PUBLICADO'
      AND r."id_archivo" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "enlace_recurso" e WHERE e."id_recurso" = r."id_recurso")
  ) THEN
    RAISE EXCEPTION 'Un recurso publicado requiere un archivo o al menos un enlace';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "recurso_publicado_destino_check"
AFTER INSERT OR UPDATE ON "recurso"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "recurso_publicado_destino_check"();

CREATE CONSTRAINT TRIGGER "enlace_recurso_publicado_destino_check"
AFTER INSERT OR UPDATE OR DELETE ON "enlace_recurso"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "recurso_publicado_destino_check"();
