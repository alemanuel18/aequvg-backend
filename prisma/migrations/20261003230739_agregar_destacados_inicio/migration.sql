
-- CreateTable
CREATE TABLE "destacado_inicio" (
    "id_destacado" SERIAL NOT NULL,
    "id_noticia" INTEGER,
    "id_evento" INTEGER,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "destacado_inicio_pkey" PRIMARY KEY ("id_destacado")
);

-- CreateIndex
CREATE INDEX "destacado_inicio_orden_idx" ON "destacado_inicio"("orden");

-- CreateIndex
CREATE UNIQUE INDEX "destacado_inicio_id_noticia_key" ON "destacado_inicio"("id_noticia");

-- CreateIndex
CREATE UNIQUE INDEX "destacado_inicio_id_evento_key" ON "destacado_inicio"("id_evento");

-- AddForeignKey
ALTER TABLE "destacado_inicio" ADD CONSTRAINT "destacado_inicio_id_noticia_fkey" FOREIGN KEY ("id_noticia") REFERENCES "noticia"("id_noticia") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destacado_inicio" ADD CONSTRAINT "destacado_inicio_id_evento_fkey" FOREIGN KEY ("id_evento") REFERENCES "evento"("id_evento") ON DELETE CASCADE ON UPDATE CASCADE;
