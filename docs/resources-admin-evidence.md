# Evidencia reproducible: recursos para estudiantes

Fecha de ejecución: **2026-10-08**  
Entorno: Bun 1.4.2, Vitest, Playwright, PostgreSQL mediante Docker Compose, almacenamiento temporal local.  
Backend probado: `bd30810` (`test/resources-integration-regression`).  
Frontend probado: `13eda8a` (`test/resources-integration-regression`).

## Comandos y resultados

Backend:

```bash
bun run typecheck
# tsc --noEmit — correcto

bun run test
# 15 archivos pasan; 138 pruebas pasan; 104 se omiten por requerir PostgreSQL

docker compose run --rm --no-deps backend sh -c \
  'RESOURCE_DATABASE_TEST=true bun run test:integration:resources'
# 3 archivos pasan; 13 pruebas pasan
```

Frontend:

```bash
bun run typecheck
# correcto; permanece la advertencia conocida de vue-router/volar

bun run test
# 8 archivos pasan; 31 pruebas pasan

CI=1 PLAYWRIGHT_FRONTEND_PORT=3015 \
  bunx playwright test tests/e2e/public-site.spec.ts --grep "recursos"
# 3 pruebas pasan
```

## Casos observados

| Caso | Resultado esperado | Resultado actual |
| --- | --- | --- |
| Carga `script.js` | `422 UNSUPPORTED_FILE_TYPE`; sin fila ni archivo creado | Cumple |
| Enlace `http://?` | `422 INVALID_RESOURCE_LINK`; sin recurso creado | Cumple |
| Eliminar archivo referenciado | `409 FILE_IN_USE`; conserva fila y binario | Cumple |
| Editar título, enlace y archivo | Consulta pública posterior refleja los tres cambios | Cumple |
| Descargar recurso publicado | `200`, MIME PDF y `Content-Disposition` con nombre original | Cumple |
| Archivar o eliminar recurso | Deja de ser público; el archivo asociado conserva metadata y referencia física | Cumple |
| Cuenta sin sesión o sin permiso | `401`/`403`; sin cambios en datos o archivos | Cumple en la suite de acceso |

La evidencia debe adjuntarse al Pull Request junto con los commits indicados y la salida completa de los comandos anteriores. Los valores de fecha, commit y entorno deben actualizarse al repetir la ejecución.
