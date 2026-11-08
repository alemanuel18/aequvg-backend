ALTER TABLE "usuario_administrativo"
  ADD COLUMN "nombres" VARCHAR(80) NOT NULL DEFAULT '',
  ADD COLUMN "apellidos" VARCHAR(80) NOT NULL DEFAULT '';

ALTER TABLE "solicitud_cuenta_administrativa"
  ADD COLUMN "nombres" VARCHAR(80) NOT NULL DEFAULT '',
  ADD COLUMN "apellidos" VARCHAR(80) NOT NULL DEFAULT '';

ALTER TABLE "usuario_estudiante"
  ADD COLUMN "nombres" VARCHAR(80) NOT NULL DEFAULT '',
  ADD COLUMN "apellidos" VARCHAR(80) NOT NULL DEFAULT '';

UPDATE "usuario_administrativo"
SET
  "nombres" = CASE
    WHEN BTRIM("nombre") ~ '\s' THEN REGEXP_REPLACE(BTRIM("nombre"), '\s+\S+$', '')
    ELSE BTRIM("nombre")
  END,
  "apellidos" = CASE
    WHEN BTRIM("nombre") ~ '\s' THEN REGEXP_REPLACE(BTRIM("nombre"), '^.*\s+', '')
    ELSE 'No registrado'
  END;

UPDATE "solicitud_cuenta_administrativa"
SET
  "nombres" = CASE
    WHEN BTRIM("nombre") ~ '\s' THEN REGEXP_REPLACE(BTRIM("nombre"), '\s+\S+$', '')
    ELSE BTRIM("nombre")
  END,
  "apellidos" = CASE
    WHEN BTRIM("nombre") ~ '\s' THEN REGEXP_REPLACE(BTRIM("nombre"), '^.*\s+', '')
    ELSE 'No registrado'
  END;

UPDATE "usuario_estudiante"
SET
  "nombres" = CASE
    WHEN BTRIM("nombre") ~ '\s' THEN REGEXP_REPLACE(BTRIM("nombre"), '\s+\S+$', '')
    ELSE BTRIM("nombre")
  END,
  "apellidos" = CASE
    WHEN BTRIM("nombre") ~ '\s' THEN REGEXP_REPLACE(BTRIM("nombre"), '^.*\s+', '')
    ELSE 'No registrado'
  END;

CREATE OR REPLACE FUNCTION "sincronizar_nombre_cuenta"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF BTRIM(NEW."nombres") = '' AND BTRIM(NEW."apellidos") = '' AND BTRIM(NEW."nombre") <> '' THEN
    NEW."nombres" := CASE
      WHEN BTRIM(NEW."nombre") ~ '\s' THEN REGEXP_REPLACE(BTRIM(NEW."nombre"), '\s+\S+$', '')
      ELSE BTRIM(NEW."nombre")
    END;
    NEW."apellidos" := CASE
      WHEN BTRIM(NEW."nombre") ~ '\s' THEN REGEXP_REPLACE(BTRIM(NEW."nombre"), '^.*\s+', '')
      ELSE 'No registrado'
    END;
  ELSE
    NEW."nombres" := REGEXP_REPLACE(BTRIM(NEW."nombres"), '\s+', ' ', 'g');
    NEW."apellidos" := REGEXP_REPLACE(BTRIM(NEW."apellidos"), '\s+', ' ', 'g');
    NEW."nombre" := BTRIM(NEW."nombres" || ' ' || NEW."apellidos");
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "usuario_administrativo_sincronizar_nombre"
BEFORE INSERT OR UPDATE OF "nombre", "nombres", "apellidos" ON "usuario_administrativo"
FOR EACH ROW EXECUTE FUNCTION "sincronizar_nombre_cuenta"();

CREATE TRIGGER "solicitud_administrativa_sincronizar_nombre"
BEFORE INSERT OR UPDATE OF "nombre", "nombres", "apellidos" ON "solicitud_cuenta_administrativa"
FOR EACH ROW EXECUTE FUNCTION "sincronizar_nombre_cuenta"();

CREATE TRIGGER "usuario_estudiante_sincronizar_nombre"
BEFORE INSERT OR UPDATE OF "nombre", "nombres", "apellidos" ON "usuario_estudiante"
FOR EACH ROW EXECUTE FUNCTION "sincronizar_nombre_cuenta"();
