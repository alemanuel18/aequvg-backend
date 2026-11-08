CREATE TYPE "accion_historial_comentario" AS ENUM ('EDIT', 'DELETE');

ALTER TABLE "comentario_publicacion"
  ADD COLUMN "eliminado_en" TIMESTAMPTZ(3);

CREATE TABLE "historial_comentario_publicacion" (
  "id_historial_comentario" SERIAL NOT NULL,
  "id_comentario" INTEGER NOT NULL,
  "id_estudiante_actor" INTEGER,
  "accion" "accion_historial_comentario" NOT NULL,
  "contenido_anterior" VARCHAR(2000) NOT NULL,
  "contenido_nuevo" VARCHAR(2000),
  "cambiado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "historial_comentario_publicacion_pkey" PRIMARY KEY ("id_historial_comentario"),
  CONSTRAINT "historial_comentario_publicacion_comentario_fkey" FOREIGN KEY ("id_comentario")
    REFERENCES "comentario_publicacion"("id_comentario") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "historial_comentario_publicacion_actor_fkey" FOREIGN KEY ("id_estudiante_actor")
    REFERENCES "usuario_estudiante"("id_estudiante") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "historial_comentario_publicacion_fecha_idx"
  ON "historial_comentario_publicacion"("cambiado_en", "id_historial_comentario");
CREATE INDEX "historial_comentario_publicacion_comentario_fecha_idx"
  ON "historial_comentario_publicacion"("id_comentario", "cambiado_en");
