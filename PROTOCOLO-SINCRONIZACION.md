# Protocolo de verificación: Sincronización Dashboard Arias

Actualizado: 03/06/2026

---

## Sistema de sincronización activo

El dashboard se sincroniza automáticamente mediante dos triggers en Apps Script:

1. **onChange** (inmediato): Se activa cada vez que alguien edita manualmente el Google Sheet GPV.
2. **Horario cada 1 hora** (respaldo): Sincroniza los últimos 200 registros de cada colección aunque no haya habido ediciones manuales. Cubre los cambios programáticos (importaciones, fórmulas, etc.).

Los datos viajan siempre en una sola dirección: Google Sheets → Firebase Firestore → Dashboard HTML.

---

## Cómo verificar que los datos están actualizados

### Verificación rápida (1 minuto)

1. Abre el dashboard en el navegador.
2. Comprueba la fecha del registro más reciente en la tabla de Visitas o Ecommerce.
3. Abre el Google Sheet GPV → pestaña "Copia Visitas" → mira la última fila.
4. La fecha del dashboard debe coincidir con la del Sheet.

### Verificación de triggers (2 minutos)

1. Ve al editor de Apps Script: https://script.google.com/home/projects/1b-Fc3QSbqYCPyy5e3VyaH0l7lJaTYuMYYJdFMVHL6r8zIlY8rdnmqz56/edit
2. Haz clic en el icono de reloj (Activadores) en el menú izquierdo.
3. Deben aparecer exactamente 2 triggers activos:
   - `onSheetChange` — Tipo: Desde hoja de cálculo / Al cambiar
   - `sincronizacionHoraria` — Tipo: Según tiempo / Cada hora
4. La columna "Última ejecución" de `sincronizacionHoraria` debe mostrar una fecha reciente (máximo 1 hora de antigüedad).

---

## Qué hacer si los datos no se actualizan

### Caso 1: El dashboard muestra datos de hace más de 1 hora

1. Abre Apps Script → Activadores.
2. Verifica que los 2 triggers están activos (ver sección anterior).
3. Si falta alguno, ejecuta `instalarTriggers()` desde Firebase.gs.

### Caso 2: Falta el trigger onSheetChange o sincronizacionHoraria

1. Abre Firebase.gs en el editor de Apps Script.
2. En el selector de función (barra superior), elige `instalarTriggers`.
3. Haz clic en "Ejecutar".
4. Autoriza si lo pide.
5. Confirma en el Registro de ejecución que aparecen los mensajes:
   - "Trigger onChange instalado para GPV."
   - "Trigger horario (cada 1h) instalado."

### Caso 3: El trigger existe pero los datos no llegan a Firebase

1. Abre Firebase.gs → selecciona `verificarSistema` → ejecuta.
2. Lee el Registro de ejecución: muestra cuántos documentos hay en cada colección y la fecha del más reciente.
3. Si el recuento es 0 o la fecha es antigua, ejecuta `sincronizacionHoraria` manualmente para forzar una sincronización completa.

### Caso 4: Error de permisos al ejecutar funciones

Causa: Los scopes de OAuth han cambiado o se revocaron.

1. Abre appsscript.json en el editor.
2. Confirma que `oauthScopes` incluye:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/script.external_request`
   - `https://www.googleapis.com/auth/cloud-platform`
   - `https://www.googleapis.com/auth/script.scriptapp`
3. Ejecuta cualquier función → acepta la nueva autorización.

---

## Límites del plan Spark (gratuito) de Firebase

| Recurso | Límite diario |
|---------|--------------|
| Escrituras | 20.000 documentos |
| Lecturas | 50.000 documentos |
| Reset del cupo | Medianoche hora del Pacífico (09:00 CEST verano / 08:00 CET invierno) |

El trigger horario sincroniza 200 registros por ejecución × 3 colecciones = máximo 600 escrituras/hora. En un día normal (24h) serían 14.400 escrituras, dentro del límite.

---

## Funciones útiles en Firebase.gs

| Función | Para qué usarla |
|---------|----------------|
| `instalarTriggers()` | Reinstalar los 2 triggers desde cero |
| `sincronizacionHoraria()` | Forzar una sincronización manual ahora mismo |
| `verificarSistema()` | Ver estado de Firebase: recuentos y fecha más reciente |
| `onSheetChange(e)` | Se ejecuta automáticamente al cambiar el Sheet (no ejecutar manualmente) |

---

## IDs de referencia rápida

- Script ID: `1b-Fc3QSbqYCPyy5e3VyaH0l7lJaTYuMYYJdFMVHL6r8zIlY8rdnmqz56`
- Firebase Project ID: `enlace-canarias`
- Sheet GPV ID: `1ro56M5OSifg4k-J06Zm_-mAzx4n9M_DtEAd_Oil6mU0`
- Sheet Ecommerce ID: `185MqaLa-dA4v_PxWAgBz-E6oSb49Leon8nONeC-YtW4`
