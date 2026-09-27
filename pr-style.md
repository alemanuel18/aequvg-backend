# Convención Obligatoria de Pull Requests

La convención y reglas de ramas y Pull Requests de este proyecto están definidas en `AGENTS.md` y `pr-style.md`.

---

## 1. Convención de Nombres de Ramas

Toda nueva rama debe crearse con base en `develop` (o la rama base correspondiente) y respetar la siguiente nomenclatura:

```text
<tipo>/<nombre-descriptivo-en-kebab-case>
```

### Tipos de ramas permitidos:

• `feature/`: Nuevas funcionalidades, módulos o modelos (ej: `feature/news-crud`, `feature/project-filters`, `feature/project-model`).
• `fix/` o `bugfix/`: Corrección de errores o incidencias.
• `ci/`: Integración continua, flujos de pipelines o infraestructura de pruebas en Docker (ej: `ci/news-postgres-integration`).
• `test/`: Incorporación o mejora de pruebas unitarias o de integración.
• `refactor/`: Refactorización de código sin alteración de funcionalidad existente.
• `chore/`: Mantenimiento, actualización de dependencias o configuraciones del proyecto.
• `docs/`: Cambios o adición de documentación técnica.
• `hotfix/`: Correcciones urgentes aplicadas directamente sobre ramas principales.

### Ejemplos válidos de ramas:

• `feature/news-crud`
• `feature/project-filters`
• `feature/news-api-docs-tests`
• `feature/news-model-categories`
• `feature/project-crud`
• `feature/project-model`
• `feature/consolidar-mvp-publico-db`
• `ci/news-postgres-integration`

---

## 2. Formato del Título de la Pull Request

El título de toda Pull Request debe respetar estrictamente el formato homologado con la convención de commits:

```text
<tipo>(<scope-en-ingles>): <Título descriptivo en español iniciando con Mayúscula y terminando con punto.>
```

### Reglas:

1. **Tipo (en minúsculas):**
    • `feat`: Nueva funcionalidad (corresponde a ramas `feature/`).
    • `fix`: Corrección de errores / bugs (corresponde a ramas `fix/` o `hotfix/`).
    • `test`: Añadir o modificar pruebas (corresponde a ramas `test/`).
    • `chore`: Mantenimiento, dependencias o tareas generales (ramas `chore/`).
    • `docs`: Documentación (ramas `docs/`).
    • `refactor`: Refactorización de código sin cambio de comportamiento (ramas `refactor/`).
    • `style`: Formateo, estilos o estética sin afectar la lógica.
    • `ci`: Integración continua / pipelines / Docker de CI (ramas `ci/`).
    • `perf`: Mejoras de rendimiento.
2. **Scope (en inglés):**
    • Entre paréntesis `()` inmediatamente antes del separador `:`.
    • Describe el módulo o ámbito afectado en inglés.
    • Ejemplos: `(news)`, `(projects)`, `(auth)`, `(routes)`, `(database)`, `(ci)`, `(docker)`.
3. **Separador:**
    • Dos puntos seguidos de un espacio obligatorio: `: `.
4. **Mensaje (en español):**
    • Debe iniciar obligatoriamente con Mayúscula (usando verbos en tercera persona / impersonal, ej: Se implementa..., Se actualiza..., Se corrige..., Se agrega...).
    • Debe terminar obligatoriamente con un punto final (`.`).
5. **Sin atribución de IA:**
    • No incluir firmas, créditos ni trailers en la PR como menciones a asistentes de IA o herramientas generativas.

### Ejemplos válidos de títulos:

• `feat(news): Se implementa el CRUD público y administrativo de noticias.`
• `feat(projects): Se agregan filtros de búsqueda por categoría para proyectos.`
• `test(news): Se agregan pruebas de integración y contratos de API para noticias.`
• `ci(news): Se configura la integración de PostgreSQL en el flujo de CI.`
• `feat(projects): Se define el modelo de datos y migraciones de proyectos.`
• `chore(database): Se consolida el esquema inicial de base de datos para el MVP.`

---

## 3. Plantilla del Cuerpo de la Pull Request

Toda Pull Request debe utilizar la siguiente estructura:

```markdown
## Descripción

Breve explicación de los cambios introducidos y el propósito de la PR.

## Tipo de cambio

- [ ] `feat`: Nueva funcionalidad
- [ ] `fix`: Corrección de error
- [ ] `test`: Pruebas
- [ ] `chore`: Tareas generales / dependencias
- [ ] `docs`: Documentación
- [ ] `refactor`: Refactorización
- [ ] `ci`: Integración continua

## Rama origen y destino

- Rama origen: `<tipo>/<nombre-rama>`
- Rama destino: `develop`

## Cambios principales

- Se implementó...
- Se actualizó...

## Verificación y pruebas

- [ ] `bun run typecheck` completado sin errores.
- [ ] `bun run test` completado con pruebas pasando.
- [ ] Verificación manual ejecutada.

## Checklist

- [ ] El título de la PR sigue el formato `<tipo>(<scope-en-ingles>): <Mensaje en español iniciando con Mayúscula y terminando con punto.>`.
- [ ] Todos los commits de la rama cumplen con la convención de `commit-style.md`.
- [ ] Sin atribución ni firmas de herramientas de IA.
- [ ] No contiene secretos, credenciales ni información sensible.
- [ ] Variables nuevas documentadas en `.env.example` y `.env.production.example` (si aplica).
```
