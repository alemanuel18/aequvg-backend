ALTER TABLE "inscripcion_evento"
  ADD COLUMN "id_estudiante" INTEGER;

ALTER TABLE "inscripcion_evento"
  ADD CONSTRAINT "inscripcion_evento_id_estudiante_fkey"
  FOREIGN KEY ("id_estudiante") REFERENCES "usuario_estudiante"("id_estudiante")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "inscripcion_evento_id_estudiante_inscrito_en_id_idx"
  ON "inscripcion_evento"("id_estudiante", "inscrito_en", "id_inscripcion");

CREATE UNIQUE INDEX "inscripcion_evento_evento_estudiante_unq"
  ON "inscripcion_evento"("id_evento", "id_estudiante")
  WHERE "id_estudiante" IS NOT NULL;
