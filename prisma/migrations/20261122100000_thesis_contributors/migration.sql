BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "enlace_tesis"
    WHERE "autor" IS NULL OR btrim("autor") = ''
  ) THEN
    RAISE EXCEPTION 'No se puede migrar autoría: hay tesis con autor vacío. Corrija esos registros antes de aplicar esta migración.';
  END IF;
END $$;

CREATE TYPE "rol_autoria_tesis" AS ENUM ('PRINCIPAL', 'COAUTOR');

ALTER TABLE "persona_autora"
  ALTER COLUMN "nombre" TYPE VARCHAR(300);

CREATE TABLE "tesis_contribuyente" (
  "id_enlace_tesis" INTEGER NOT NULL,
  "id_persona" INTEGER NOT NULL,
  "rol_autoria" "rol_autoria_tesis" NOT NULL,
  "orden_autoria" SMALLINT NOT NULL,
  CONSTRAINT "tesis_contribuyente_pkey" PRIMARY KEY ("id_enlace_tesis", "id_persona"),
  CONSTRAINT "tesis_contribuyente_orden_positivo_check" CHECK ("orden_autoria" > 0),
  CONSTRAINT "tesis_contribuyente_rol_orden_check" CHECK (
    ("rol_autoria" = 'PRINCIPAL' AND "orden_autoria" = 1)
    OR ("rol_autoria" = 'COAUTOR' AND "orden_autoria" > 1)
  )
);

CREATE UNIQUE INDEX "tesis_contribuyente_id_enlace_tesis_orden_autoria_key"
  ON "tesis_contribuyente"("id_enlace_tesis", "orden_autoria");
CREATE INDEX "tesis_contribuyente_id_persona_orden_autoria_idx"
  ON "tesis_contribuyente"("id_persona", "orden_autoria");

DO $$
DECLARE
  thesis_row RECORD;
  person_id INTEGER;
BEGIN
  FOR thesis_row IN
    SELECT "id_enlace_tesis", "autor"
    FROM "enlace_tesis"
    ORDER BY "id_enlace_tesis"
  LOOP
    INSERT INTO "persona_autora" ("nombre")
    VALUES (thesis_row."autor")
    RETURNING "id_persona" INTO person_id;

    INSERT INTO "tesis_contribuyente" (
      "id_enlace_tesis", "id_persona", "rol_autoria", "orden_autoria"
    ) VALUES (
      thesis_row."id_enlace_tesis", person_id, 'PRINCIPAL', 1
    );
  END LOOP;
END $$;

ALTER TABLE "tesis_contribuyente"
  ADD CONSTRAINT "tesis_contribuyente_id_enlace_tesis_fkey"
  FOREIGN KEY ("id_enlace_tesis") REFERENCES "enlace_tesis"("id_enlace_tesis")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tesis_contribuyente"
  ADD CONSTRAINT "tesis_contribuyente_id_persona_fkey"
  FOREIGN KEY ("id_persona") REFERENCES "persona_autora"("id_persona")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
