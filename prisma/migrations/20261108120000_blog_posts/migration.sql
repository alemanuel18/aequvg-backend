CREATE TABLE "entrada_blog" (
    "id_entrada_blog" SERIAL NOT NULL,
    "creado_por" INTEGER NOT NULL,
    "id_imagen" INTEGER,
    "titulo" VARCHAR(220) NOT NULL,
    "slug" VARCHAR(240) NOT NULL,
    "resumen" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "estado" "estado_contenido" NOT NULL DEFAULT 'BORRADOR',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "publicado_en" TIMESTAMPTZ(3),

    CONSTRAINT "entrada_blog_pkey" PRIMARY KEY ("id_entrada_blog"),
    CONSTRAINT "entrada_blog_estado_publicacion_check" CHECK (
      ("estado" = 'PUBLICADO' AND "publicado_en" IS NOT NULL)
      OR ("estado" IN ('BORRADOR', 'ARCHIVADO') AND "publicado_en" IS NULL)
    )
);

CREATE UNIQUE INDEX "entrada_blog_slug_key" ON "entrada_blog"("slug");
CREATE INDEX "entrada_blog_estado_publicado_en_idx" ON "entrada_blog"("estado", "publicado_en");
CREATE INDEX "entrada_blog_creado_por_idx" ON "entrada_blog"("creado_por");
CREATE INDEX "entrada_blog_id_imagen_idx" ON "entrada_blog"("id_imagen");

ALTER TABLE "entrada_blog" ADD CONSTRAINT "entrada_blog_creado_por_fkey"
  FOREIGN KEY ("creado_por") REFERENCES "usuario_administrativo"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "entrada_blog" ADD CONSTRAINT "entrada_blog_id_imagen_fkey"
  FOREIGN KEY ("id_imagen") REFERENCES "archivo"("id_archivo") ON DELETE RESTRICT ON UPDATE CASCADE;
