CREATE TABLE "enlace_tesis" (
    "id_enlace_tesis" SERIAL NOT NULL,
    "identificador_origen" VARCHAR(255),
    "titulo" VARCHAR(300) NOT NULL,
    "autor" VARCHAR(300),
    "anio_publicacion" SMALLINT,
    "resumen" TEXT,
    "url" VARCHAR(2048) NOT NULL,
    "creado_por" INTEGER NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "publicado_en" TIMESTAMPTZ(3),
    CONSTRAINT "enlace_tesis_pkey" PRIMARY KEY ("id_enlace_tesis")
);

CREATE UNIQUE INDEX "enlace_tesis_identificador_origen_key" ON "enlace_tesis"("identificador_origen");
CREATE UNIQUE INDEX "enlace_tesis_url_key" ON "enlace_tesis"("url");
CREATE INDEX "enlace_tesis_publicado_en_creado_en_idx" ON "enlace_tesis"("publicado_en", "creado_en");
CREATE INDEX "enlace_tesis_creado_por_idx" ON "enlace_tesis"("creado_por");

ALTER TABLE "enlace_tesis" ADD CONSTRAINT "enlace_tesis_creado_por_fkey"
FOREIGN KEY ("creado_por") REFERENCES "usuario_administrativo"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
