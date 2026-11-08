ALTER TABLE "inscripcion_evento"
  ADD COLUMN "nombres" VARCHAR(80) NOT NULL DEFAULT '',
  ADD COLUMN "apellidos" VARCHAR(80) NOT NULL DEFAULT '';

ALTER TABLE "miembro_junta"
  ADD COLUMN "nombres" VARCHAR(80) NOT NULL DEFAULT '',
  ADD COLUMN "apellidos" VARCHAR(80) NOT NULL DEFAULT '';

ALTER TABLE "solicitud_contacto"
  ADD COLUMN "nombres" VARCHAR(80) NOT NULL DEFAULT '',
  ADD COLUMN "apellidos" VARCHAR(80) NOT NULL DEFAULT '';

UPDATE "inscripcion_evento"
SET
  "nombres" = CASE WHEN BTRIM("nombre_completo") ~ '\s' THEN REGEXP_REPLACE(BTRIM("nombre_completo"), '\s+\S+$', '') ELSE BTRIM("nombre_completo") END,
  "apellidos" = CASE WHEN BTRIM("nombre_completo") ~ '\s' THEN REGEXP_REPLACE(BTRIM("nombre_completo"), '^.*\s+', '') ELSE 'No registrado' END;

UPDATE "miembro_junta"
SET
  "nombres" = CASE WHEN BTRIM("nombre") ~ '\s' THEN REGEXP_REPLACE(BTRIM("nombre"), '\s+\S+$', '') ELSE BTRIM("nombre") END,
  "apellidos" = CASE WHEN BTRIM("nombre") ~ '\s' THEN REGEXP_REPLACE(BTRIM("nombre"), '^.*\s+', '') ELSE 'No registrado' END;

UPDATE "solicitud_contacto"
SET
  "nombres" = CASE WHEN BTRIM("nombre") ~ '\s' THEN REGEXP_REPLACE(BTRIM("nombre"), '\s+\S+$', '') ELSE BTRIM("nombre") END,
  "apellidos" = CASE WHEN BTRIM("nombre") ~ '\s' THEN REGEXP_REPLACE(BTRIM("nombre"), '^.*\s+', '') ELSE 'No registrado' END;
