ALTER TABLE "proyecto" ADD COLUMN "id_documento" INTEGER;
CREATE INDEX "proyecto_id_documento_idx" ON "proyecto"("id_documento");
ALTER TABLE "proyecto" ADD CONSTRAINT "proyecto_id_documento_fkey" FOREIGN KEY ("id_documento") REFERENCES "archivo"("id_archivo") ON DELETE RESTRICT ON UPDATE CASCADE;
