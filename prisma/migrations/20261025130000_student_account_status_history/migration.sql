CREATE TABLE "historial_estado_cuenta_estudiante" (
  "id_historial" SERIAL NOT NULL,
  "id_estudiante" INTEGER NOT NULL,
  "id_actor_administrativo" INTEGER,
  "estado_anterior" "estado_cuenta_estudiante" NOT NULL,
  "estado_nuevo" "estado_cuenta_estudiante" NOT NULL,
  "motivo" TEXT NOT NULL,
  "bloqueado_hasta" TIMESTAMPTZ(3),
  "canal_revision" VARCHAR(255),
  "registrado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "historial_estado_cuenta_estudiante_pkey" PRIMARY KEY ("id_historial"),
  CONSTRAINT "historial_estado_cuenta_estudiante_id_estudiante_fkey"
    FOREIGN KEY ("id_estudiante") REFERENCES "usuario_estudiante"("id_estudiante") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "historial_estado_cuenta_estudiante_actor_fkey"
    FOREIGN KEY ("id_actor_administrativo") REFERENCES "usuario_administrativo"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "historial_estado_cuenta_estudiante_id_estudiante_registrado_en_idx"
  ON "historial_estado_cuenta_estudiante"("id_estudiante", "registrado_en");
CREATE INDEX "historial_estado_cuenta_estudiante_actor_registrado_en_idx"
  ON "historial_estado_cuenta_estudiante"("id_actor_administrativo", "registrado_en");
