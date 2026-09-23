-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "tipo_bloque_institucional" AS ENUM ('HERO', 'CAMPO_LABORAL', 'TESTIMONIO', 'LABORATORIO', 'PLAN_ESTUDIOS');

-- CreateEnum
CREATE TYPE "estado_usuario_administrativo" AS ENUM ('ACTIVO', 'INACTIVO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "tipo_publicacion_cientifica" AS ENUM ('PAPER_DERIVADO_TESIS', 'PROYECTO_INVESTIGACION');

-- CreateEnum
CREATE TYPE "estado_publicacion_cientifica" AS ENUM ('PENDIENTE_APROBACION', 'APROBADO', 'PUBLICADO', 'RECHAZADO', 'ARCHIVADO');

-- CreateEnum
CREATE TYPE "rol_contribucion" AS ENUM ('AUTOR', 'COAUTOR', 'ASESOR', 'COLABORADOR');

-- CreateEnum
CREATE TYPE "responsabilidad_aprobacion" AS ENUM ('ASOCIACION', 'FACULTAD', 'DIRECCION');

-- CreateEnum
CREATE TYPE "estado_aprobacion" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "estado_contenido" AS ENUM ('BORRADOR', 'PUBLICADO', 'ARCHIVADO');

-- CreateEnum
CREATE TYPE "estado_evento" AS ENUM ('BORRADOR', 'PUBLICADO', 'FINALIZADO', 'CANCELADO', 'ARCHIVADO');

-- CreateEnum
CREATE TYPE "estado_inscripcion_evento" AS ENUM ('CONFIRMADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "estado_miembro_junta" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "estado_solicitud_contacto" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'ATENDIDA', 'ARCHIVADA');

-- CreateEnum
CREATE TYPE "tipo_solicitud_contacto" AS ENUM ('CONSULTA', 'REUNION');

-- CreateEnum
CREATE TYPE "tipo_medio_contacto" AS ENUM ('EMAIL', 'TELEFONO', 'UBICACION', 'INSTAGRAM', 'FACEBOOK', 'OTRO');

-- CreateTable
CREATE TABLE "rol" (
    "id_rol" SERIAL NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "rol_pkey" PRIMARY KEY ("id_rol")
);

-- CreateTable
CREATE TABLE "permiso" (
    "id_permiso" SERIAL NOT NULL,
    "codigo" VARCHAR(120) NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "permiso_pkey" PRIMARY KEY ("id_permiso")
);

-- CreateTable
CREATE TABLE "rol_permiso" (
    "id_rol" INTEGER NOT NULL,
    "id_permiso" INTEGER NOT NULL,

    CONSTRAINT "rol_permiso_pkey" PRIMARY KEY ("id_rol","id_permiso")
);

-- CreateTable
CREATE TABLE "usuario_administrativo" (
    "id_usuario" SERIAL NOT NULL,
    "id_rol" INTEGER NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "correo" CITEXT NOT NULL,
    "estado" "estado_usuario_administrativo" NOT NULL DEFAULT 'ACTIVO',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuario_administrativo_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "credencial_administrativa" (
    "id_usuario" INTEGER NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "credencial_administrativa_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "archivo" (
    "id_archivo" SERIAL NOT NULL,
    "cargado_por" INTEGER NOT NULL,
    "nombre_original" VARCHAR(255) NOT NULL,
    "clave_almacenamiento" VARCHAR(512) NOT NULL,
    "tipo_mime" VARCHAR(150) NOT NULL,
    "tamano_bytes" BIGINT NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivo_pkey" PRIMARY KEY ("id_archivo")
);

-- CreateTable
CREATE TABLE "publicacion_cientifica" (
    "id_publicacion" SERIAL NOT NULL,
    "creado_por" INTEGER NOT NULL,
    "id_archivo" INTEGER,
    "id_publicacion_original" INTEGER,
    "titulo" CITEXT NOT NULL,
    "tipo" "tipo_publicacion_cientifica" NOT NULL,
    "resumen" TEXT NOT NULL,
    "area_investigacion" VARCHAR(180) NOT NULL,
    "palabras_clave" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "anio_publicacion" SMALLINT NOT NULL,
    "datos_bibliograficos" TEXT,
    "enlace_externo" VARCHAR(2048),
    "estado" "estado_publicacion_cientifica" NOT NULL DEFAULT 'PENDIENTE_APROBACION',
    "registrado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicado_en" TIMESTAMPTZ(3),

    CONSTRAINT "publicacion_cientifica_pkey" PRIMARY KEY ("id_publicacion")
);

-- CreateTable
CREATE TABLE "persona_autora" (
    "id_persona" SERIAL NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,

    CONSTRAINT "persona_autora_pkey" PRIMARY KEY ("id_persona")
);

-- CreateTable
CREATE TABLE "publicacion_contribuyente" (
    "id_publicacion" INTEGER NOT NULL,
    "id_persona" INTEGER NOT NULL,
    "rol_contribucion" "rol_contribucion" NOT NULL DEFAULT 'AUTOR',
    "orden_autoria" SMALLINT NOT NULL,

    CONSTRAINT "publicacion_contribuyente_pkey" PRIMARY KEY ("id_publicacion","id_persona")
);

-- CreateTable
CREATE TABLE "aprobacion_publicacion" (
    "id_aprobacion" SERIAL NOT NULL,
    "id_publicacion" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "responsabilidad" "responsabilidad_aprobacion" NOT NULL,
    "estado" "estado_aprobacion" NOT NULL DEFAULT 'PENDIENTE',
    "observaciones" TEXT,
    "registrada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aprobacion_publicacion_pkey" PRIMARY KEY ("id_aprobacion")
);

-- CreateTable
CREATE TABLE "noticia" (
    "id_noticia" SERIAL NOT NULL,
    "creado_por" INTEGER NOT NULL,
    "id_imagen" INTEGER,
    "titulo" VARCHAR(220) NOT NULL,
    "resumen" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "categoria" VARCHAR(100) NOT NULL,
    "estado" "estado_contenido" NOT NULL DEFAULT 'BORRADOR',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicado_en" TIMESTAMPTZ(3),

    CONSTRAINT "noticia_pkey" PRIMARY KEY ("id_noticia")
);

-- CreateTable
CREATE TABLE "evento" (
    "id_evento" SERIAL NOT NULL,
    "creado_por" INTEGER NOT NULL,
    "id_imagen" INTEGER,
    "nombre" VARCHAR(220) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "inicia_en" TIMESTAMPTZ(3) NOT NULL,
    "ubicacion" VARCHAR(255) NOT NULL,
    "capacidad_maxima" INTEGER NOT NULL,
    "informacion_adicional" TEXT,
    "estado" "estado_evento" NOT NULL DEFAULT 'BORRADOR',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_pkey" PRIMARY KEY ("id_evento")
);

-- CreateTable
CREATE TABLE "inscripcion_evento" (
    "id_inscripcion" SERIAL NOT NULL,
    "id_evento" INTEGER NOT NULL,
    "nombre_completo" VARCHAR(160) NOT NULL,
    "correo" CITEXT NOT NULL,
    "telefono" VARCHAR(40) NOT NULL,
    "estado" "estado_inscripcion_evento" NOT NULL DEFAULT 'CONFIRMADA',
    "consentimiento_en" TIMESTAMPTZ(3) NOT NULL,
    "version_privacidad" VARCHAR(40) NOT NULL,
    "inscrito_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inscripcion_evento_pkey" PRIMARY KEY ("id_inscripcion")
);

-- CreateTable
CREATE TABLE "recurso" (
    "id_recurso" SERIAL NOT NULL,
    "creado_por" INTEGER NOT NULL,
    "id_archivo" INTEGER,
    "titulo" VARCHAR(220) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "categoria" VARCHAR(100) NOT NULL,
    "enlace_externo" VARCHAR(2048),
    "estado" "estado_contenido" NOT NULL DEFAULT 'BORRADOR',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicado_en" TIMESTAMPTZ(3),

    CONSTRAINT "recurso_pkey" PRIMARY KEY ("id_recurso")
);

-- CreateTable
CREATE TABLE "miembro_junta" (
    "id_miembro" SERIAL NOT NULL,
    "id_fotografia" INTEGER,
    "nombre" VARCHAR(160) NOT NULL,
    "cargo" VARCHAR(120) NOT NULL,
    "descripcion" TEXT,
    "correo_institucional" CITEXT NOT NULL,
    "periodo" VARCHAR(80) NOT NULL,
    "periodo_inicio" DATE,
    "periodo_fin" DATE,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "estado" "estado_miembro_junta" NOT NULL DEFAULT 'ACTIVO',

    CONSTRAINT "miembro_junta_pkey" PRIMARY KEY ("id_miembro")
);

-- CreateTable
CREATE TABLE "solicitud_contacto" (
    "id_solicitud" SERIAL NOT NULL,
    "atendido_por" INTEGER,
    "nombre" VARCHAR(160) NOT NULL,
    "correo" CITEXT NOT NULL,
    "telefono" VARCHAR(40) NOT NULL,
    "tipo" "tipo_solicitud_contacto" NOT NULL DEFAULT 'CONSULTA',
    "asunto" VARCHAR(220) NOT NULL,
    "mensaje" TEXT NOT NULL,
    "fecha_preferida" TIMESTAMPTZ(3),
    "estado_atencion" "estado_solicitud_contacto" NOT NULL DEFAULT 'PENDIENTE',
    "consentimiento_en" TIMESTAMPTZ(3) NOT NULL,
    "version_privacidad" VARCHAR(40) NOT NULL,
    "enviado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitud_contacto_pkey" PRIMARY KEY ("id_solicitud")
);

-- CreateTable
CREATE TABLE "bloque_institucional" (
    "id_bloque" SERIAL NOT NULL,
    "tipo" "tipo_bloque_institucional" NOT NULL,
    "titulo" VARCHAR(220) NOT NULL,
    "subtitulo" VARCHAR(320),
    "contenido" TEXT NOT NULL,
    "imagen_url" VARCHAR(2048),
    "accion_texto" VARCHAR(100),
    "accion_url" VARCHAR(2048),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "estado" "estado_contenido" NOT NULL DEFAULT 'BORRADOR',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "publicado_en" TIMESTAMPTZ(3),

    CONSTRAINT "bloque_institucional_pkey" PRIMARY KEY ("id_bloque")
);

-- CreateTable
CREATE TABLE "medio_contacto" (
    "id_medio" SERIAL NOT NULL,
    "tipo" "tipo_medio_contacto" NOT NULL,
    "etiqueta" VARCHAR(100) NOT NULL,
    "valor" VARCHAR(320) NOT NULL,
    "url" VARCHAR(2048),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "medio_contacto_pkey" PRIMARY KEY ("id_medio")
);

-- CreateIndex
CREATE UNIQUE INDEX "rol_nombre_key" ON "rol"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "permiso_codigo_key" ON "permiso"("codigo");

-- CreateIndex
CREATE INDEX "rol_permiso_id_permiso_idx" ON "rol_permiso"("id_permiso");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_administrativo_correo_key" ON "usuario_administrativo"("correo");

-- CreateIndex
CREATE INDEX "usuario_administrativo_id_rol_estado_idx" ON "usuario_administrativo"("id_rol", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "archivo_clave_almacenamiento_key" ON "archivo"("clave_almacenamiento");

-- CreateIndex
CREATE INDEX "archivo_cargado_por_idx" ON "archivo"("cargado_por");

-- CreateIndex
CREATE INDEX "archivo_checksum_sha256_idx" ON "archivo"("checksum_sha256");

-- CreateIndex
CREATE INDEX "publicacion_cientifica_estado_tipo_anio_publicacion_idx" ON "publicacion_cientifica"("estado", "tipo", "anio_publicacion");

-- CreateIndex
CREATE INDEX "publicacion_cientifica_titulo_idx" ON "publicacion_cientifica"("titulo");

-- CreateIndex
CREATE INDEX "publicacion_cientifica_creado_por_idx" ON "publicacion_cientifica"("creado_por");

-- CreateIndex
CREATE INDEX "publicacion_cientifica_id_archivo_idx" ON "publicacion_cientifica"("id_archivo");

-- CreateIndex
CREATE INDEX "publicacion_cientifica_id_publicacion_original_idx" ON "publicacion_cientifica"("id_publicacion_original");

-- CreateIndex
CREATE INDEX "persona_autora_nombre_idx" ON "persona_autora"("nombre");

-- CreateIndex
CREATE INDEX "publicacion_contribuyente_id_persona_idx" ON "publicacion_contribuyente"("id_persona");

-- CreateIndex
CREATE UNIQUE INDEX "publicacion_contribuyente_id_publicacion_orden_autoria_key" ON "publicacion_contribuyente"("id_publicacion", "orden_autoria");

-- CreateIndex
CREATE INDEX "aprobacion_publicacion_id_publicacion_estado_idx" ON "aprobacion_publicacion"("id_publicacion", "estado");

-- CreateIndex
CREATE INDEX "aprobacion_publicacion_id_usuario_idx" ON "aprobacion_publicacion"("id_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "aprobacion_publicacion_id_publicacion_id_usuario_key" ON "aprobacion_publicacion"("id_publicacion", "id_usuario");

-- CreateIndex
CREATE INDEX "noticia_estado_publicado_en_idx" ON "noticia"("estado", "publicado_en");

-- CreateIndex
CREATE INDEX "noticia_creado_por_idx" ON "noticia"("creado_por");

-- CreateIndex
CREATE INDEX "noticia_id_imagen_idx" ON "noticia"("id_imagen");

-- CreateIndex
CREATE INDEX "evento_estado_inicia_en_idx" ON "evento"("estado", "inicia_en");

-- CreateIndex
CREATE INDEX "evento_creado_por_idx" ON "evento"("creado_por");

-- CreateIndex
CREATE INDEX "evento_id_imagen_idx" ON "evento"("id_imagen");

-- CreateIndex
CREATE INDEX "inscripcion_evento_id_evento_estado_idx" ON "inscripcion_evento"("id_evento", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "inscripcion_evento_id_evento_correo_key" ON "inscripcion_evento"("id_evento", "correo");

-- CreateIndex
CREATE INDEX "recurso_estado_publicado_en_idx" ON "recurso"("estado", "publicado_en");

-- CreateIndex
CREATE INDEX "recurso_creado_por_idx" ON "recurso"("creado_por");

-- CreateIndex
CREATE INDEX "recurso_id_archivo_idx" ON "recurso"("id_archivo");

-- CreateIndex
CREATE INDEX "miembro_junta_estado_orden_idx" ON "miembro_junta"("estado", "orden");

-- CreateIndex
CREATE INDEX "miembro_junta_periodo_inicio_periodo_fin_idx" ON "miembro_junta"("periodo_inicio", "periodo_fin");

-- CreateIndex
CREATE INDEX "miembro_junta_id_fotografia_idx" ON "miembro_junta"("id_fotografia");

-- CreateIndex
CREATE INDEX "solicitud_contacto_estado_atencion_enviado_en_idx" ON "solicitud_contacto"("estado_atencion", "enviado_en");

-- CreateIndex
CREATE INDEX "solicitud_contacto_atendido_por_idx" ON "solicitud_contacto"("atendido_por");

-- CreateIndex
CREATE INDEX "bloque_institucional_estado_tipo_orden_idx" ON "bloque_institucional"("estado", "tipo", "orden");

-- CreateIndex
CREATE INDEX "medio_contacto_activo_orden_idx" ON "medio_contacto"("activo", "orden");

-- AddForeignKey
ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_id_rol_fkey" FOREIGN KEY ("id_rol") REFERENCES "rol"("id_rol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_id_permiso_fkey" FOREIGN KEY ("id_permiso") REFERENCES "permiso"("id_permiso") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_administrativo" ADD CONSTRAINT "usuario_administrativo_id_rol_fkey" FOREIGN KEY ("id_rol") REFERENCES "rol"("id_rol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credencial_administrativa" ADD CONSTRAINT "credencial_administrativa_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario_administrativo"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivo" ADD CONSTRAINT "archivo_cargado_por_fkey" FOREIGN KEY ("cargado_por") REFERENCES "usuario_administrativo"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacion_cientifica" ADD CONSTRAINT "publicacion_cientifica_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuario_administrativo"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacion_cientifica" ADD CONSTRAINT "publicacion_cientifica_id_archivo_fkey" FOREIGN KEY ("id_archivo") REFERENCES "archivo"("id_archivo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacion_cientifica" ADD CONSTRAINT "publicacion_cientifica_id_publicacion_original_fkey" FOREIGN KEY ("id_publicacion_original") REFERENCES "publicacion_cientifica"("id_publicacion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacion_contribuyente" ADD CONSTRAINT "publicacion_contribuyente_id_publicacion_fkey" FOREIGN KEY ("id_publicacion") REFERENCES "publicacion_cientifica"("id_publicacion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacion_contribuyente" ADD CONSTRAINT "publicacion_contribuyente_id_persona_fkey" FOREIGN KEY ("id_persona") REFERENCES "persona_autora"("id_persona") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aprobacion_publicacion" ADD CONSTRAINT "aprobacion_publicacion_id_publicacion_fkey" FOREIGN KEY ("id_publicacion") REFERENCES "publicacion_cientifica"("id_publicacion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aprobacion_publicacion" ADD CONSTRAINT "aprobacion_publicacion_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario_administrativo"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "noticia" ADD CONSTRAINT "noticia_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuario_administrativo"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "noticia" ADD CONSTRAINT "noticia_id_imagen_fkey" FOREIGN KEY ("id_imagen") REFERENCES "archivo"("id_archivo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuario_administrativo"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_id_imagen_fkey" FOREIGN KEY ("id_imagen") REFERENCES "archivo"("id_archivo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscripcion_evento" ADD CONSTRAINT "inscripcion_evento_id_evento_fkey" FOREIGN KEY ("id_evento") REFERENCES "evento"("id_evento") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurso" ADD CONSTRAINT "recurso_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuario_administrativo"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurso" ADD CONSTRAINT "recurso_id_archivo_fkey" FOREIGN KEY ("id_archivo") REFERENCES "archivo"("id_archivo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miembro_junta" ADD CONSTRAINT "miembro_junta_id_fotografia_fkey" FOREIGN KEY ("id_fotografia") REFERENCES "archivo"("id_archivo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_contacto" ADD CONSTRAINT "solicitud_contacto_atendido_por_fkey" FOREIGN KEY ("atendido_por") REFERENCES "usuario_administrativo"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain invariants that Prisma cannot express as field attributes.
ALTER TABLE "usuario_administrativo" ADD CONSTRAINT "usuario_correo_uvg_check" CHECK (LOWER("correo"::text) LIKE '%@uvg.edu.gt');
ALTER TABLE "archivo" ADD CONSTRAINT "archivo_tamano_positivo_check" CHECK ("tamano_bytes" > 0);
ALTER TABLE "publicacion_contribuyente" ADD CONSTRAINT "contribuyente_orden_positivo_check" CHECK ("orden_autoria" > 0);
ALTER TABLE "evento" ADD CONSTRAINT "evento_capacidad_positiva_check" CHECK ("capacidad_maxima" > 0);
ALTER TABLE "recurso" ADD CONSTRAINT "recurso_destino_check" CHECK ("id_archivo" IS NOT NULL OR "enlace_externo" IS NOT NULL);
ALTER TABLE "miembro_junta" ADD CONSTRAINT "miembro_orden_check" CHECK ("orden" >= 0);
ALTER TABLE "miembro_junta" ADD CONSTRAINT "miembro_periodo_check" CHECK ("periodo_inicio" IS NULL OR "periodo_fin" IS NULL OR "periodo_inicio" <= "periodo_fin");
ALTER TABLE "bloque_institucional" ADD CONSTRAINT "bloque_orden_check" CHECK ("orden" >= 0);
ALTER TABLE "medio_contacto" ADD CONSTRAINT "medio_orden_check" CHECK ("orden" >= 0);
ALTER TABLE "solicitud_contacto" ADD CONSTRAINT "reunion_fecha_preferida_check" CHECK ("tipo" <> 'REUNION' OR "fecha_preferida" IS NOT NULL);
