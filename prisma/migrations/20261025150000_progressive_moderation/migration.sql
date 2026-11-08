CREATE TYPE "origen_infraccion_moderacion" AS ENUM ('COMMENT_CREATE', 'COMMENT_EDIT', 'PROFILE_NAME_UPDATE');
CREATE TYPE "accion_sancion_moderacion" AS ENUM ('NONE', 'TEMPORARY', 'PERMANENT');

ALTER TABLE "usuario_estudiante"
  ADD COLUMN "contador_infracciones_moderacion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "inicio_ventana_moderacion" TIMESTAMPTZ(3);

ALTER TABLE "usuario_estudiante"
  ADD CONSTRAINT "usuario_estudiante_moderacion_contador_check"
  CHECK ("contador_infracciones_moderacion" >= 0);

CREATE TABLE "infraccion_moderacion" (
  "id_infraccion" SERIAL NOT NULL,
  "id_estudiante" INTEGER,
  "clave_operacion" CHAR(64) NOT NULL,
  "origen" "origen_infraccion_moderacion" NOT NULL,
  "version_politica" VARCHAR(80) NOT NULL,
  "id_regla" VARCHAR(120) NOT NULL,
  "hash_evidencia" CHAR(64) NOT NULL,
  "numero_infraccion" INTEGER NOT NULL,
  "sancion" "accion_sancion_moderacion" NOT NULL,
  "bloqueado_hasta" TIMESTAMPTZ(3),
  "canal_revision" VARCHAR(255),
  "cuenta_reincidencia" BOOLEAN NOT NULL DEFAULT TRUE,
  "registrada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "infraccion_moderacion_pkey" PRIMARY KEY ("id_infraccion"),
  CONSTRAINT "infraccion_moderacion_numero_check" CHECK ("numero_infraccion" > 0),
  CONSTRAINT "infraccion_moderacion_id_estudiante_fkey"
    FOREIGN KEY ("id_estudiante") REFERENCES "usuario_estudiante"("id_estudiante") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "infraccion_moderacion_clave_operacion_key" ON "infraccion_moderacion"("clave_operacion");
CREATE INDEX "infraccion_moderacion_estudiante_fecha_idx" ON "infraccion_moderacion"("id_estudiante", "registrada_en");
CREATE INDEX "infraccion_moderacion_politica_fecha_idx" ON "infraccion_moderacion"("version_politica", "registrada_en");
