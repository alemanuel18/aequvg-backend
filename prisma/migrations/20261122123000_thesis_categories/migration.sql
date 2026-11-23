BEGIN;

CREATE TABLE "categoria_tesis" (
  "id_categoria_tesis" SERIAL NOT NULL,
  "nombre" CITEXT NOT NULL,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "categoria_tesis_pkey" PRIMARY KEY ("id_categoria_tesis")
);

CREATE UNIQUE INDEX "categoria_tesis_nombre_key" ON "categoria_tesis"("nombre");
CREATE INDEX "categoria_tesis_activa_nombre_idx" ON "categoria_tesis"("activa", "nombre");

CREATE TABLE "tesis_categoria" (
  "id_enlace_tesis" INTEGER NOT NULL,
  "id_categoria_tesis" INTEGER NOT NULL,
  CONSTRAINT "tesis_categoria_pkey" PRIMARY KEY ("id_enlace_tesis", "id_categoria_tesis")
);

CREATE INDEX "tesis_categoria_id_categoria_tesis_id_enlace_tesis_idx"
  ON "tesis_categoria"("id_categoria_tesis", "id_enlace_tesis");

ALTER TABLE "tesis_categoria"
  ADD CONSTRAINT "tesis_categoria_id_enlace_tesis_fkey"
  FOREIGN KEY ("id_enlace_tesis") REFERENCES "enlace_tesis"("id_enlace_tesis")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tesis_categoria"
  ADD CONSTRAINT "tesis_categoria_id_categoria_tesis_fkey"
  FOREIGN KEY ("id_categoria_tesis") REFERENCES "categoria_tesis"("id_categoria_tesis")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "categoria_tesis" ("nombre", "actualizado_en") VALUES
  ('Química analítica', CURRENT_TIMESTAMP),
  ('Química ambiental', CURRENT_TIMESTAMP),
  ('Química computacional', CURRENT_TIMESTAMP),
  ('Síntesis y productos naturales', CURRENT_TIMESTAMP),
  ('Química farmacéutica', CURRENT_TIMESTAMP),
  ('Procesos industriales', CURRENT_TIMESTAMP)
ON CONFLICT ("nombre") DO NOTHING;

COMMIT;
