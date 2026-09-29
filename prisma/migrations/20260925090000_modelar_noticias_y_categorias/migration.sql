-- Replace the free-text category with a normalized category relation.
CREATE TABLE "categoria_noticia" (
    "id_categoria_noticia" SERIAL NOT NULL,
    "nombre" CITEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categoria_noticia_pkey" PRIMARY KEY ("id_categoria_noticia")
);

CREATE UNIQUE INDEX "categoria_noticia_nombre_key" ON "categoria_noticia"("nombre");
CREATE INDEX "categoria_noticia_activa_nombre_idx" ON "categoria_noticia"("activa", "nombre");

-- Preserve existing data and make blank legacy values explicit.
INSERT INTO "categoria_noticia" ("nombre", "activa", "creado_en", "actualizado_en")
SELECT MIN(COALESCE(NULLIF(BTRIM("categoria"), ''), 'Sin categoría')), true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "noticia"
GROUP BY LOWER(COALESCE(NULLIF(BTRIM("categoria"), ''), 'Sin categoría'));

ALTER TABLE "noticia" ADD COLUMN "id_categoria_noticia" INTEGER;
ALTER TABLE "noticia" ADD COLUMN "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "noticia" AS noticia
SET "id_categoria_noticia" = categoria."id_categoria_noticia"
FROM "categoria_noticia" AS categoria
WHERE categoria."nombre" = COALESCE(NULLIF(BTRIM(noticia."categoria"), ''), 'Sin categoría');

-- A published item must have a publication date; other states do not expose one.
UPDATE "noticia"
SET "publicado_en" = COALESCE("publicado_en", "creado_en")
WHERE "estado" = 'PUBLICADO';

UPDATE "noticia"
SET "publicado_en" = NULL
WHERE "estado" <> 'PUBLICADO';

ALTER TABLE "noticia" ALTER COLUMN "id_categoria_noticia" SET NOT NULL;
ALTER TABLE "noticia" DROP COLUMN "categoria";
ALTER TABLE "noticia" ALTER COLUMN "actualizado_en" DROP DEFAULT;

ALTER TABLE "noticia" ADD CONSTRAINT "noticia_id_categoria_noticia_fkey"
  FOREIGN KEY ("id_categoria_noticia") REFERENCES "categoria_noticia"("id_categoria_noticia")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "noticia" ADD CONSTRAINT "noticia_estado_publicacion_check"
  CHECK (
    ("estado" = 'PUBLICADO' AND "publicado_en" IS NOT NULL)
    OR ("estado" IN ('BORRADOR', 'ARCHIVADO') AND "publicado_en" IS NULL)
  );

CREATE INDEX "noticia_id_categoria_noticia_estado_publicado_en_idx"
  ON "noticia"("id_categoria_noticia", "estado", "publicado_en");
