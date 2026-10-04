---
name: review-pr
description: Use when reviewing a teammate's pull request as the weekly reviewer of a folder. Checks the PR against its task in docs/tasks.md, the shared agreements and the architecture rules in AGENTS.md.
---

# Revisar un PR

1. **Busca la tarea** del título en `docs/tasks.md` y compara el PR con sus "Pasos" y su "Criterio de verificación". Lo que falte se pide; lo que sobre se cuestiona.
2. **Revisa las reglas de `AGENTS.md`:**
   - ¿Hay lógica de juego en `web/` o estado de la partida fuera de la goroutine de la sala?
   - ¿Algún servicio toca la base de datos de otro?
   - ¿Se copió un tipo de `proto/`, `messages/` o `shared/` dentro de un servicio?
   - ¿Hay IPs, contraseñas o puertos fijos en el código en vez de variables de entorno?
   - ¿Las llamadas por red tienen timeout? ¿Los consumidores toleran duplicados?
3. **Corre el PR:** haz checkout de la rama, corre el comando de la carpeta y `docker compose up --build`. Prueba tú mismo el criterio de verificación.
4. **Revisa la lista "Listo"** de la plantilla: pruebas si hay lógica y docs actualizados si cambió un acuerdo.
5. **Responde el mismo día.** Aprueba si el criterio se cumple; si no, deja comentarios concretos con archivo y línea, separando lo que bloquea de lo opcional.
