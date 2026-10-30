CREATE TABLE "categoria_evento" (
    "id_categoria_evento" SERIAL NOT NULL,
    "nombre" CITEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "categoria_evento_pkey" PRIMARY KEY ("id_categoria_evento")
);

CREATE UNIQUE INDEX "categoria_evento_nombre_key" ON "categoria_evento"("nombre");
CREATE INDEX "categoria_evento_activa_nombre_idx" ON "categoria_evento"("activa", "nombre");
ALTER TABLE "categoria_evento" ADD CONSTRAINT "categoria_evento_nombre_no_vacio_check" CHECK (BTRIM("nombre"::TEXT) <> '');

ALTER TABLE "evento" ADD COLUMN "id_categoria_evento" INTEGER;
CREATE INDEX "evento_id_categoria_evento_idx" ON "evento"("id_categoria_evento");
ALTER TABLE "evento" ADD CONSTRAINT "evento_id_categoria_evento_fkey"
  FOREIGN KEY ("id_categoria_evento") REFERENCES "categoria_evento"("id_categoria_evento") ON DELETE RESTRICT ON UPDATE CASCADE;
