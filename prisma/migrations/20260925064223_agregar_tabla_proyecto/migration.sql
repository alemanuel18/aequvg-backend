-- CreateEnum
CREATE TYPE "estado_proyecto" AS ENUM ('NO_APROBADO', 'APROBADO', 'EN_REVISION');

-- CreateTable
CREATE TABLE "proyecto" (
    "id_proyecto" SERIAL NOT NULL,
    "id_autor" INTEGER NOT NULL,
    "id_revisor" INTEGER,
    "id_imagen_portada" INTEGER,
    "titulo" CITEXT NOT NULL,
    "slug" VARCHAR(220) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "url_repositorio" VARCHAR(2048),
    "url_demo" VARCHAR(2048),
    "estado" "estado_proyecto" NOT NULL DEFAULT 'EN_REVISION',
    "motivo_rechazo" TEXT,
    "revisado_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "proyecto_pkey" PRIMARY KEY ("id_proyecto")
);

-- CreateIndex
CREATE UNIQUE INDEX "proyecto_slug_key" ON "proyecto"("slug");

-- CreateIndex
CREATE INDEX "proyecto_estado_creado_en_idx" ON "proyecto"("estado", "creado_en");

-- CreateIndex
CREATE INDEX "proyecto_id_autor_idx" ON "proyecto"("id_autor");

-- CreateIndex
CREATE INDEX "proyecto_id_revisor_idx" ON "proyecto"("id_revisor");

-- CreateIndex
CREATE INDEX "proyecto_id_imagen_portada_idx" ON "proyecto"("id_imagen_portada");

-- AddForeignKey
ALTER TABLE "proyecto" ADD CONSTRAINT "proyecto_id_autor_fkey" FOREIGN KEY ("id_autor") REFERENCES "usuario_administrativo"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto" ADD CONSTRAINT "proyecto_id_revisor_fkey" FOREIGN KEY ("id_revisor") REFERENCES "usuario_administrativo"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto" ADD CONSTRAINT "proyecto_id_imagen_portada_fkey" FOREIGN KEY ("id_imagen_portada") REFERENCES "archivo"("id_archivo") ON DELETE RESTRICT ON UPDATE CASCADE;
