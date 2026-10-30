CREATE TABLE "recuperacion_contrasena_administrativa" (
  "id_recuperacion" SERIAL PRIMARY KEY,
  "id_usuario" INTEGER NOT NULL,
  "hash_token" CHAR(64) NOT NULL UNIQUE,
  "expira_en" TIMESTAMPTZ(3) NOT NULL,
  "usado_en" TIMESTAMPTZ(3),
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recuperacion_contrasena_administrativa_usuario_fkey"
    FOREIGN KEY ("id_usuario") REFERENCES "usuario_administrativo"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "recuperacion_contrasena_administrativa_usuario_usado_expira_idx"
  ON "recuperacion_contrasena_administrativa"("id_usuario", "usado_en", "expira_en");
CREATE INDEX "recuperacion_contrasena_administrativa_expira_usado_idx"
  ON "recuperacion_contrasena_administrativa"("expira_en", "usado_en");
