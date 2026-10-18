CREATE TYPE "estado_cuenta_estudiante" AS ENUM (
  'ACTIVO',
  'BLOQUEADO_TEMPORAL',
  'BLOQUEADO_PERMANENTE',
  'ELIMINADO'
);

CREATE TABLE "usuario_estudiante" (
  "id_estudiante" SERIAL NOT NULL,
  "nombre" VARCHAR(160) NOT NULL,
  "correo" CITEXT NOT NULL,
  "es_estudiante" BOOLEAN NOT NULL DEFAULT TRUE,
  "estado" "estado_cuenta_estudiante" NOT NULL DEFAULT 'ACTIVO',
  "bloqueado_hasta" TIMESTAMPTZ(3),
  "canal_revision" VARCHAR(255),
  "eliminado_en" TIMESTAMPTZ(3),
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "usuario_estudiante_pkey" PRIMARY KEY ("id_estudiante"),
  CONSTRAINT "usuario_estudiante_condicion_check" CHECK ("es_estudiante" = TRUE),
  CONSTRAINT "usuario_estudiante_bloqueo_check" CHECK (
    ("estado" = 'BLOQUEADO_TEMPORAL' AND "bloqueado_hasta" IS NOT NULL)
    OR ("estado" <> 'BLOQUEADO_TEMPORAL' AND "bloqueado_hasta" IS NULL)
  ),
  CONSTRAINT "usuario_estudiante_baja_check" CHECK (
    ("estado" = 'ELIMINADO' AND "eliminado_en" IS NOT NULL)
    OR ("estado" <> 'ELIMINADO' AND "eliminado_en" IS NULL)
  )
);

CREATE TABLE "credencial_estudiante" (
  "id_estudiante" INTEGER NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "credencial_estudiante_pkey" PRIMARY KEY ("id_estudiante")
);

CREATE TABLE "sesion_estudiante" (
  "id_sesion" UUID NOT NULL,
  "id_estudiante" INTEGER NOT NULL,
  "hash_identificador_token" CHAR(64) NOT NULL,
  "hash_secreto_dispositivo" CHAR(64) NOT NULL,
  "hash_contexto_navegador" CHAR(64) NOT NULL,
  "hash_token_csrf" CHAR(64) NOT NULL,
  "expira_en" TIMESTAMPTZ(3) NOT NULL,
  "ultima_actividad_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revocada_en" TIMESTAMPTZ(3),
  "motivo_revocacion" VARCHAR(80),
  "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sesion_estudiante_pkey" PRIMARY KEY ("id_sesion")
);

CREATE UNIQUE INDEX "usuario_estudiante_correo_key" ON "usuario_estudiante"("correo");
CREATE INDEX "usuario_estudiante_estado_bloqueado_hasta_idx" ON "usuario_estudiante"("estado", "bloqueado_hasta");
CREATE UNIQUE INDEX "sesion_estudiante_hash_identificador_token_key" ON "sesion_estudiante"("hash_identificador_token");
CREATE INDEX "sesion_estudiante_id_estudiante_revocada_en_expira_en_idx" ON "sesion_estudiante"("id_estudiante", "revocada_en", "expira_en");
CREATE INDEX "sesion_estudiante_expira_en_idx" ON "sesion_estudiante"("expira_en");

ALTER TABLE "credencial_estudiante"
  ADD CONSTRAINT "credencial_estudiante_id_estudiante_fkey"
  FOREIGN KEY ("id_estudiante") REFERENCES "usuario_estudiante"("id_estudiante")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sesion_estudiante"
  ADD CONSTRAINT "sesion_estudiante_id_estudiante_fkey"
  FOREIGN KEY ("id_estudiante") REFERENCES "usuario_estudiante"("id_estudiante")
  ON DELETE CASCADE ON UPDATE CASCADE;
