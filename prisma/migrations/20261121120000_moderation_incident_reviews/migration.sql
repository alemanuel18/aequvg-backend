ALTER TABLE "infraccion_moderacion"
  ADD COLUMN "revisada_en" TIMESTAMPTZ(3),
  ADD COLUMN "id_revisor" INTEGER,
  ADD COLUMN "motivo_revision" TEXT;

ALTER TABLE "infraccion_moderacion"
  ADD CONSTRAINT "infraccion_moderacion_id_revisor_fkey"
  FOREIGN KEY ("id_revisor") REFERENCES "usuario_administrativo"("id_usuario")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "infraccion_moderacion_revisada_por_fecha_idx"
  ON "infraccion_moderacion"("id_revisor", "revisada_en");
