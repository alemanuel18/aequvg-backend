CREATE TYPE "tipo_destino_comentario" AS ENUM ('NOTICIA', 'PROYECTO', 'EVENTO');

CREATE TABLE "comentario_publicacion" (
  "id_comentario" SERIAL NOT NULL,
  "id_estudiante" INTEGER,
  "tipo_destino" "tipo_destino_comentario" NOT NULL,
  "id_noticia" INTEGER,
  "id_proyecto" INTEGER,
  "id_evento" INTEGER,
  "contenido" VARCHAR(2000) NOT NULL,
  "hash_deduplicacion" CHAR(64) NOT NULL,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "comentario_publicacion_pkey" PRIMARY KEY ("id_comentario"),
  CONSTRAINT "comentario_publicacion_un_destino_check" CHECK (
    ("id_noticia" IS NOT NULL)::integer +
    ("id_proyecto" IS NOT NULL)::integer +
    ("id_evento" IS NOT NULL)::integer = 1
  ),
  CONSTRAINT "comentario_publicacion_tipo_destino_check" CHECK (
    ("tipo_destino" = 'NOTICIA' AND "id_noticia" IS NOT NULL) OR
    ("tipo_destino" = 'PROYECTO' AND "id_proyecto" IS NOT NULL) OR
    ("tipo_destino" = 'EVENTO' AND "id_evento" IS NOT NULL)
  ),
  CONSTRAINT "comentario_publicacion_estudiante_fkey" FOREIGN KEY ("id_estudiante")
    REFERENCES "usuario_estudiante"("id_estudiante") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "comentario_publicacion_noticia_fkey" FOREIGN KEY ("id_noticia")
    REFERENCES "noticia"("id_noticia") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "comentario_publicacion_proyecto_fkey" FOREIGN KEY ("id_proyecto")
    REFERENCES "proyecto"("id_proyecto") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "comentario_publicacion_evento_fkey" FOREIGN KEY ("id_evento")
    REFERENCES "evento"("id_evento") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "comentario_publicacion_no_duplicado_idx"
  ON "comentario_publicacion"("hash_deduplicacion");
CREATE INDEX "comentario_publicacion_noticia_fecha_idx"
  ON "comentario_publicacion"("tipo_destino", "id_noticia", "creado_en");
CREATE INDEX "comentario_publicacion_proyecto_fecha_idx"
  ON "comentario_publicacion"("tipo_destino", "id_proyecto", "creado_en");
CREATE INDEX "comentario_publicacion_evento_fecha_idx"
  ON "comentario_publicacion"("tipo_destino", "id_evento", "creado_en");
CREATE INDEX "comentario_publicacion_estudiante_fecha_idx"
  ON "comentario_publicacion"("id_estudiante", "creado_en");
