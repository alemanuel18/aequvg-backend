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
SELECT DISTINCT "categoria", CURRENT_TIMESTAMP FROM "recurso";

ALTER TABLE "recurso" ADD COLUMN "id_categoria_recurso" INTEGER;
UPDATE "recurso" r SET "id_categoria_recurso" = c."id_categoria_recurso"
FROM "categoria_recurso" c WHERE c."nombre" = r."categoria";
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
