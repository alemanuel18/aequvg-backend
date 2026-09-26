# Convención Obligatoria de Commits

La convención y reglas de commits de este proyecto están definidas en `AGENTS.md` y `commit-style.md`.

Todos los commits deben respetar estrictamente el siguiente formato:

```text
<tipo>(<scope-en-ingles>): <Mensaje descriptivo en español iniciando con Mayúscula y terminando con punto.>
```

### Reglas:

1. **Tipo (en minúsculas):**
    • `feat`: Nueva funcionalidad.
    • `fix`: Corrección de errores / bugs.
    • `test`: Añadir o modificar pruebas.
    • `chore`: Mantenimiento, dependencias, tareas generales.
    • `docs`: Documentación.
    • `refactor`: Refactorización de código sin cambio de comportamiento.
    • `style`: Formateo, estilos o estética sin afectar la lógica.
    • `ci`: Integración continua / pipelines.
    • `perf`: Mejoras de rendimiento.
2. **Scope (en inglés):**
    • Entre paréntesis `()` inmediatamente antes del separador `:`.
    • Describe el módulo o ámbito afectado en inglés.
    • Ejemplos: `(auth)`, `(cart)`, `(routes)`, `(services)`, `(ui-modals)`, `(nginx)`, `(csp)`.
3. **Separador:**
    • Dos puntos seguidos de un espacio obligatorio: `: `.
4. **Mensaje (en español):**
    • Debe iniciar obligatoriamente con Mayúscula (usando verbos en tercera persona / impersonal, ej: Se implementa..., Se actualiza..., Se corrige..., Se agrega...).
    • Debe terminar obligatoriamente con un punto final (`.`).
5. **Sin atribución de IA:**
    • No incluir firmas ni trailers en el commit como `Co-Authored-By: Assistant <...>` o menciones a herramientas de IA.

### Ejemplos válidos:

• `feat(auth): Se implementa la autenticación con tokens JWT.`
• `fix(cart): Se corrige el cálculo de impuestos en el resumen de compra.`
• `feat(routes): Se protegen los endpoints privados con validación de sesión.`
• `chore(deps): Se actualizan las dependencias principales del proyecto.`
• `test(services): Se agregan pruebas unitarias para el servicio de pagos.`
• `docs(readme): Se documentan los pasos de instalación y configuración local.`
