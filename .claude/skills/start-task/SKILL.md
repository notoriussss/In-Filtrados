---
name: start-task
description: Use when starting or finishing a task from docs/tasks.md (ids like S1-08). Sets up the branch, gathers the agreements the task depends on, and checks the task's verification criterion and definition of done before opening the PR.
---

# Empezar y cerrar una tarea

1. **Ubica la tarea** en `docs/tasks.md` por su id (`S1-08`). Lee completos su "Por qué", "Archivos", "Pasos" y "Criterio de verificación".
2. **Lee los acuerdos que toca** en `docs/tasks.md`, sección 0 (puertos, `/health`, mapa, movimiento, mensajes, REST y eventos). Si la tarea cita `docs/architecture.md` o `docs/deployment-lab.md`, lee esa sección también.
3. **Crea la rama** desde `main` actualizado: `git switch -c feat/<id>-<slug-en-ingles>`.
4. **Implementa solo lo que pide la tarea**, en la carpeta de su servicio. Si necesitas cambiar un contrato compartido, para y usa la skill `change-contract`.
5. **Verifica** con el comando de la carpeta (tabla "Comandos por servicio" de `AGENTS.md`) y luego con el criterio de verificación de la tarea tal como está escrito. Si hay lógica (un `if`, un ciclo o un cálculo), deja al menos una prueba automática.
6. **Comprueba el sistema completo:** `docker compose up --build` y que `docker compose ps` muestre todo `running` o `healthy`.
7. **Abre el PR** con la plantilla, el id en el título (`S1-08: room goroutine with ticker`) y pide revisión al revisor de esa carpeta esta semana (`docs/team-plan.md`, sección 2).

No marques la tarea como lista si algún paso del criterio de verificación no se corrió; di cuál falta.
