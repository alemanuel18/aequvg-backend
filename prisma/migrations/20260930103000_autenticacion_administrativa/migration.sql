CREATE TYPE "proveedor_autenticacion" AS ENUM ('PASSWORD', 'MICROSOFT');

CREATE TABLE "identidad_administrativa" (
  "id_identidad" SERIAL NOT NULL,
  "id_usuario" INTEGER NOT NULL,
  "proveedor" "proveedor_autenticacion" NOT NULL,
  "sujeto_proveedor" VARCHAR(255) NOT NULL,
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "identidad_administrativa_pkey" PRIMARY KEY ("id_identidad")
);

CREATE TABLE "sesion_administrativa" (
  "id_sesion" UUID NOT NULL,
  "id_usuario" INTEGER NOT NULL,
  "hash_identificador_token" CHAR(64) NOT NULL,
  "hash_secreto_dispositivo" CHAR(64) NOT NULL,
  "hash_contexto_navegador" CHAR(64) NOT NULL,
  "hash_token_csrf" CHAR(64) NOT NULL,
  "expira_en" TIMESTAMPTZ(3) NOT NULL,
  "ultima_actividad_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revocada_en" TIMESTAMPTZ(3),
  "motivo_revocacion" VARCHAR(80),
  "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sesion_administrativa_pkey" PRIMARY KEY ("id_sesion")
);

CREATE TABLE "desafio_inicio_microsoft" (
  "id_desafio" UUID NOT NULL,
  "hash_estado" CHAR(64) NOT NULL,
  "hash_verificador" CHAR(64) NOT NULL,
  "nonce" VARCHAR(128) NOT NULL,
  "retorno_a" VARCHAR(2048),
  "expira_en" TIMESTAMPTZ(3) NOT NULL,
  "consumido_en" TIMESTAMPTZ(3),
  "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "desafio_inicio_microsoft_pkey" PRIMARY KEY ("id_desafio")
);

CREATE UNIQUE INDEX "identidad_administrativa_proveedor_sujeto_proveedor_key"
  ON "identidad_administrativa"("proveedor", "sujeto_proveedor");
CREATE UNIQUE INDEX "identidad_administrativa_id_usuario_proveedor_key"
  ON "identidad_administrativa"("id_usuario", "proveedor");
CREATE INDEX "identidad_administrativa_id_usuario_idx"
  ON "identidad_administrativa"("id_usuario");
CREATE UNIQUE INDEX "sesion_administrativa_hash_identificador_token_key"
  ON "sesion_administrativa"("hash_identificador_token");
CREATE INDEX "sesion_administrativa_id_usuario_revocada_en_expira_en_idx"
  ON "sesion_administrativa"("id_usuario", "revocada_en", "expira_en");
CREATE INDEX "sesion_administrativa_expira_en_idx"
  ON "sesion_administrativa"("expira_en");
CREATE UNIQUE INDEX "desafio_inicio_microsoft_hash_estado_key"
  ON "desafio_inicio_microsoft"("hash_estado");
CREATE INDEX "desafio_inicio_microsoft_expira_en_consumido_en_idx"
  ON "desafio_inicio_microsoft"("expira_en", "consumido_en");

ALTER TABLE "identidad_administrativa"
  ADD CONSTRAINT "identidad_administrativa_id_usuario_fkey"
  FOREIGN KEY ("id_usuario") REFERENCES "usuario_administrativo"("id_usuario")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sesion_administrativa"
  ADD CONSTRAINT "sesion_administrativa_id_usuario_fkey"
  FOREIGN KEY ("id_usuario") REFERENCES "usuario_administrativo"("id_usuario")
  ON DELETE CASCADE ON UPDATE CASCADE;
