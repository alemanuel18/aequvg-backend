ALTER TABLE "comentario_publicacion" ADD COLUMN "id_tesis" INTEGER;

ALTER TABLE "comentario_publicacion" DROP CONSTRAINT "comentario_publicacion_un_destino_check";
ALTER TABLE "comentario_publicacion" DROP CONSTRAINT "comentario_publicacion_tipo_destino_check";

ALTER TABLE "comentario_publicacion" ADD CONSTRAINT "comentario_publicacion_un_destino_check" CHECK (
  ("id_noticia" IS NOT NULL)::integer +
  ("id_proyecto" IS NOT NULL)::integer +
  ("id_evento" IS NOT NULL)::integer +
  ("id_tesis" IS NOT NULL)::integer = 1
);
ALTER TABLE "comentario_publicacion" ADD CONSTRAINT "comentario_publicacion_tipo_destino_check" CHECK (
  ("tipo_destino" = 'NOTICIA' AND "id_noticia" IS NOT NULL) OR
  ("tipo_destino" = 'PROYECTO' AND "id_proyecto" IS NOT NULL) OR
  ("tipo_destino" = 'EVENTO' AND "id_evento" IS NOT NULL) OR
  ("tipo_destino" = 'TESIS' AND "id_tesis" IS NOT NULL)
);

ALTER TABLE "comentario_publicacion" ADD CONSTRAINT "comentario_publicacion_tesis_fkey"
  FOREIGN KEY ("id_tesis") REFERENCES "enlace_tesis"("id_enlace_tesis") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "comentario_publicacion_tesis_fecha_idx"
  ON "comentario_publicacion"("tipo_destino", "id_tesis", "creado_en");
