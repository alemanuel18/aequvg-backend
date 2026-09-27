CREATE TYPE "tipo_proyecto" AS ENUM ('TESIS', 'PROYECTO');

-- Los registros existentes no tenían clasificación; se preservan como proyectos.
ALTER TABLE "proyecto"
  ADD COLUMN "tipo" "tipo_proyecto" NOT NULL DEFAULT 'PROYECTO';

ALTER TABLE "proyecto"
  ALTER COLUMN "tipo" DROP DEFAULT;

CREATE INDEX "proyecto_estado_tipo_creado_en_idx"
  ON "proyecto"("estado", "tipo", "creado_en");
