CREATE TYPE "estado_solicitud_administrativa" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

CREATE TABLE "solicitud_cuenta_administrativa" (
  "id_solicitud" SERIAL PRIMARY KEY,
  "nombre" VARCHAR(160) NOT NULL,
  "correo" CITEXT NOT NULL,
  "password_hash" VARCHAR(255),
  "estado" "estado_solicitud_administrativa" NOT NULL DEFAULT 'PENDIENTE',
  "id_revisor" INTEGER,
  "revisado_en" TIMESTAMPTZ(3),
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "solicitud_cuenta_administrativa_revisor_fkey"
    FOREIGN KEY ("id_revisor") REFERENCES "usuario_administrativo"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "solicitud_cuenta_administrativa_estado_creado_en_idx"
  ON "solicitud_cuenta_administrativa"("estado", "creado_en");
CREATE INDEX "solicitud_cuenta_administrativa_correo_estado_idx"
  ON "solicitud_cuenta_administrativa"("correo", "estado");
CREATE UNIQUE INDEX "solicitud_cuenta_administrativa_correo_pendiente_key"
  ON "solicitud_cuenta_administrativa"("correo") WHERE "estado" = 'PENDIENTE';
