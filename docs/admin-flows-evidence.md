# Evidencia reproducible: acceso administrativo y proyectos

Fecha: **2026-10-11**, Guatemala (UTC−06:00). Repositorio local; no se adjuntó a una PR externa.

| Código fuente | Revisión al ejecutar |
| --- | --- |
| Backend | `729afe2121e91c6ff14cf6e22178622efb9ed9f3` |
| Frontend | `c1cfcb8bdc729bd5d43ef5c949099a09321e2ce2` |

Los documentos de flujo añadidos después de estas revisiones describen comportamiento observado en el árbol de trabajo. No cambian API, OpenAPI ni la colección Hoppscotch.

## Resultados ejecutados

| Área | Comando / entorno | Resultado |
| --- | --- | --- |
| Backend typecheck | `cd aequvg-backend && bun run typecheck` | Aprobado (`tsc --noEmit`). |
| Backend suite disponible | `cd aequvg-backend && bun run test` | Aprobado: 20 archivos, 207 pruebas aprobadas; 11 archivos/111 pruebas omitidos por depender de PostgreSQL o configuración específica. Incluye pruebas unitarias de sesión, criptografía, rate limit, usuarios y proyectos. |
| Proyectos con PostgreSQL | `cd aequvg-backend && bun run test:integration:projects` | No ejecutable en este entorno: `db:5432` no responde. La suite falló al conectar en `beforeAll`; limpieza también reportó conexión fallida. No se considera evidencia aprobada. |
| Frontend typecheck | `cd aequvg-frontend && bun run typecheck` | No ejecutable: `nuxt: command not found` (dependencias del frontend no instaladas). |
| Frontend unitarias | `cd aequvg-frontend && bun run test` | No ejecutable: `vitest: command not found` (dependencias del frontend no instaladas). |
| E2E administrativos | No existe una prueba Playwright dedicada al flujo de proyectos ni al flujo UI completo de alta/recuperación. | Brecha de cobertura registrada; sin resultado atribuido. |

Para reproducir backend con base aislada:

```bash
cd aequvg-backend
bun run typecheck
bun run test
# Configurar DATABASE_URL hacia PostgreSQL aislada y migrada:
bun run test:integration:projects
bun run test:integration:auth
```

Para reproducir frontend tras `bun install --frozen-lockfile`:

```bash
cd aequvg-frontend
bun run typecheck
bun run test
bunx playwright test tests/e2e/public-site.spec.ts --grep "proteger el panel|proyectos"
```

El último filtro es una futura comprobación focalizada: hoy no hay caso E2E de administración de proyectos; Playwright puede reportar cero coincidencias si el texto no existe. Para que los resultados de base de datos cuenten, registrar URL/servicio usado sin revelar credenciales, versión de PostgreSQL, migración aplicada, conteo pasado/fallido y códigos HTTP. No incluir sesiones, cookies, tokens, contraseñas, datos personales ni URLs con secretos.

## Evidencia de cobertura existente y límites

- `tests/integration/projects.database.test.ts` ya comprueba alta, edición, aprobación, consulta pública, filtros/paginación, eliminación, falta de sesión, slug duplicado e IDs inexistentes cuando PostgreSQL está disponible.
- `tests/integration/auth.database.test.ts` y las pruebas unitarias listadas en `admin-access-flow.md` cubren sesión, hash, expiración/revocación y reglas relacionadas. No cubren todavía el flujo completo de endpoints de revisión de altas y recuperación como recorrido UI.
- `tests/integration/file.api.database.test.ts` contiene cobertura de archivos; no se ejecutó en esta revisión porque depende de DB y almacenamiento configurados.
- No se alteró contrato de API ni esquema Prisma. La evidencia de pantalla responsive/teclado para proyectos sigue pendiente de E2E focalizado.

Estado de adjunción externa: **evidencia local preparada; ninguna PR o comentario externo fue actualizado**.
