# Dashboard Arias

Portal de dashboards interactivos conectados a Google Sheets, publicados en GitHub Pages.

---

## Reglas fundamentales

1. **Datos siempre reales.** Nunca usar datos generados o inventados en ningún dashboard ni artefacto de preview. Si no hay acceso a la fuente real, parar y comunicarlo.
2. **Verificación obligatoria.** Los datos mostrados en el dashboard deben coincidir exactamente con los datos de la fuente: mismos IDs, mismas fechas, mismos valores.
3. **Fuente de verdad:** Firebase Firestore (sincronizado desde Google Sheets). El dashboard lee siempre desde Firebase, nunca directamente desde el Sheet.

---

## Arquitectura: Google Sheets → Firebase → Dashboard

Cuando la fuente de datos es un Google Sheet, el flujo es siempre:

```
Google Sheets → (Apps Script sincroniza) → Firebase Firestore → Dashboard HTML
```

**Por qué Firebase y no Apps Script directamente:**
- Apps Script tiene límites de tiempo de ejecución (6 minutos) y cuota de peticiones.
- Firebase Firestore permite consultas en tiempo real, filtros, paginación y carga instantánea desde el navegador.
- El dashboard no depende de que Apps Script esté disponible en cada visita.

---

## Proceso de migración Google Sheets → Firebase

Cada vez que se crea un nuevo dashboard con fuente en Google Sheets, hay que hacer una **carga inicial** a Firestore y luego mantener la sincronización automática.

### 1. Preparar Firebase

1. Crear proyecto en [Firebase Console](https://console.firebase.google.com)
2. Activar **Firestore Database** en modo producción
3. Configurar reglas de lectura pública:
   ```
   rules_version = '2';
   service cloud.firestore.beta1 {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read: if true;
         allow write: if request.auth != null;
       }
     }
   }
   ```
4. Anotar el `projectId` y la `apiKey` (Settings > General > Tu aplicación)

### 2. Crear el script de sincronización

Copiar y adaptar `dashboard-01/apps-script/Firebase.gs`. Ajustar:
- `FIREBASE_CONFIG.projectId` y `FIREBASE_CONFIG.apiKey`
- `SHEET_IDS` con los IDs de cada Sheet
- Nombres de colecciones Firestore (`visitas_arias`, `productos_arias`, etc.)
- Nombres de pestañas del Sheet

### 3. Carga inicial (datos históricos)

Ejecutar desde el editor de Apps Script:
- `cargaInicialCompleta()` si todos los datos caben en el cupo diario.
- Si hay más de 20.000 documentos en alguna colección, hacer la carga en días consecutivos (ver sección "Límites").

### 4. Instalar el trigger de sincronización automática

Ejecutar `instalarTrigger()` una sola vez. Esto crea un trigger `onChange` que sincroniza automáticamente cada vez que cambia el Sheet.

---

## Límites importantes del plan Spark (gratuito) de Firebase

| Límite | Valor |
|--------|-------|
| Escrituras por día | **20.000 documentos** |
| Lecturas por día | 50.000 |
| Reset del cupo | Medianoche hora del Pacífico (09:00 CEST en verano) |

**Si una colección tiene más de 20.000 documentos:**
- La carga inicial requiere varios días (un lote de ≤20.000 docs por día).
- Usar `cargaProductosPendientes()` como función de reanudación, ajustando la constante `INICIO` al índice donde se quedó la carga anterior.
- La función usa `prod_N` como docId, donde N es el índice de fila (0-based). Esto permite reanudar sin duplicados.
- Crear un trigger diario (09:00-10:00 CEST) para automatizar la reanudación.
- **Tras completar la carga inicial, borrar el trigger diario** y activar solo el trigger `onChange`.

**Alternativa:** Activar el plan Blaze (pago por uso). Para volúmenes habituales de este proyecto el coste es inferior a 1 €/mes.

---

## Dashboards

| Nº | Nombre | Carpeta | Descripción | Estado Firebase |
|----|--------|---------|-------------|-----------------|
| 01 | Arias | dashboard-01/ | GPV y Ecommerce de Burgo de Arias | Completa |

---

## Firebase — Proyecto enlace-canarias

- **Project ID:** `enlace-canarias`
- **API Key:** `AIzaSyAVgnw2V2Tc9f-IHuvoJKNGyroFIfg2XlY`

### Colecciones Firestore

| Colección | Fuente (Sheet) | Pestaña | DocId | Estado |
|-----------|----------------|---------|-------|--------|
| `visitas_arias` | GPV | Copia Visitas | `form_id` | Completa (3.402 docs) |
| `productos_arias` | GPV | Copia Productos | `prod_N` | Completa (25.044 docs, Centro y Cadena actualizados) |
| `ecommerce_arias` | Ecommerce | Ecommerce | `form_id` | Completa (2.071 docs) |

---

## Fuentes de datos (Google Sheets)

### Base de datos GPV
- **Sheet ID:** `1ro56M5OSifg4k-J06Zm_-mAzx4n9M_DtEAd_Oil6mU0`
- **Pestañas:** Info Productos, Centros, Copia Visitas, Copia Productos, Copia FotosInicial

### Base de datos Ecommerce
- **Sheet ID:** `185MqaLa-dA4v_PxWAgBz-E6oSb49Leon8nONeC-YtW4`
- **Pestañas:** Ecommerce, Productos

---

## Apps Script — Proyecto en Google

- **Script ID:** `1b-Fc3QSbqYCPyy5e3VyaH0l7lJaTYuMYYJdFMVHL6r8zIlY8rdnmqz56`
- **URL editor:** https://script.google.com/home/projects/1b-Fc3QSbqYCPyy5e3VyaH0l7lJaTYuMYYJdFMVHL6r8zIlY8rdnmqz56/edit
- **Cuenta:** enlace@enlacecanarias.com

### Archivos del script

| Archivo | Función |
|---------|---------|
| `Code.gs` | Endpoint JSON para leer Sheets (legacy, usado durante el desarrollo) |
| `Firebase.gs` | Sincronización Sheets → Firestore |

### Funciones principales de Firebase.gs

| Función | Descripción |
|---------|-------------|
| `cargaInicialCompleta()` | Carga todas las colecciones desde cero |
| `cargaProductos()` | Recarga completa de productos_arias |
| `cargaProductosPendientes()` | Reanuda carga desde prod_20000 (ajustar INICIO si es necesario) |
| `actualizarCentroCadena()` | Actualiza solo los campos Centro y Cadena (prod_0 a prod_25043) |
| `instalarTrigger()` | Instala el trigger onChange para sincronización continua |
| `onSheetChange(e)` | Manejador del trigger: sincroniza los últimos 50 docs de la pestaña modificada |

### Endpoint Apps Script (legacy)

```
https://script.google.com/macros/s/AKfycbw94WIrUb1KQqgnWF7XWge7LXU3OZ5sJlkcAIs4KtgCMgl6uNEkbPPVaglkCFUVOyCJ/exec?sheet=gpv&tab=Copia Visitas
```

---

## Estructura de carpetas

```
Dashboard/
├── index.html                    # Portal principal
├── README.md                     # Este archivo
├── assets/
│   ├── css/
│   │   └── estilos.css           # Estilos compartidos
│   └── js/
│       └── utils.js              # Funciones comunes
└── dashboard-01/
    ├── index.html                # Dashboard Arias
    └── apps-script/
        ├── Code.gs               # Endpoint JSON (legacy)
        └── Firebase.gs           # Sincronización con Firestore
```

---

## Cómo desplegar el Apps Script

1. Ir a [script.google.com](https://script.google.com)
2. Crear nuevo proyecto
3. Pegar el contenido de `dashboard-01/apps-script/Code.gs`
4. Clic en **Desplegar > Nueva implementación**
5. Tipo: **App web** — Ejecutar como: **Yo** — Acceso: **Cualquiera**
6. Copiar la URL y pegarla en `dashboard-01/index.html` donde dice `APPS_SCRIPT_URL`

## Cómo actualizar el Apps Script

1. Abrir el proyecto en script.google.com
2. Clic en **Desplegar > Gestionar implementaciones**
3. Clic en el lápiz de edición > Versión: **Nueva versión** > Desplegar

---

## Publicación en GitHub Pages

1. Crear repositorio en GitHub
2. Subir todos los archivos
3. Settings > Pages > Deploy from branch > main > raíz
4. URL portal: `https://tu-usuario.github.io/nombre-repo/`
5. Dashboard Arias: `https://tu-usuario.github.io/nombre-repo/dashboard-01/`
