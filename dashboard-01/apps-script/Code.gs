// =============================================================
// APPS SCRIPT - Dashboard Arias
// Despliega como Web App con acceso: Cualquiera
// =============================================================

var SHEET_IDS = {
  gpv: '1ro56M5OSifg4k-J06Zm_-mAzx4n9M_DtEAd_Oil6mU0',
  ecommerce: '185MqaLa-dA4v_PxWAgBz-E6oSb49Leon8nONeC-YtW4'
};

var TAB_ALIAS = {
  'visitas':          { sheet: 'gpv',        tab: 'Copia Visitas' },
  'productos_pvp':    { sheet: 'gpv',        tab: 'Copia Productos' },
  'info_productos':   { sheet: 'gpv',        tab: 'Info Productos' },
  'centros':          { sheet: 'gpv',        tab: 'Centros' },
  'fotos':            { sheet: 'gpv',        tab: 'Copia FotosInicial' },
  'ecommerce':        { sheet: 'ecommerce',  tab: 'Ecommerce' },
  'ecom_productos':   { sheet: 'ecommerce',  tab: 'Productos' }
};

var CACHE_TTL = 300; // 5 minutos

function doGet(e) {
  try {
    var params  = e.parameter;
    var alias   = params.alias   || '';
    var sheet   = params.sheet   || 'gpv';
    var tab     = params.tab     || '';
    var limit   = params.limit   ? parseInt(params.limit)  : 0;
    var offset  = params.offset  ? parseInt(params.offset) : 0;
    var nocache = params.nocache || '';

    if (alias && TAB_ALIAS[alias]) {
      sheet = TAB_ALIAS[alias].sheet;
      tab   = TAB_ALIAS[alias].tab;
    }

    if (!tab) {
      return respuesta({ error: 'Falta el parametro tab o alias' });
    }

    var sheetId = SHEET_IDS[sheet];
    if (!sheetId) {
      return respuesta({ error: 'Sheet desconocido: ' + sheet });
    }

    var cacheKey = 'dash_' + sheet + '_' + tab + '_' + limit + '_' + offset;
    var cache    = CacheService.getScriptCache();

    if (!nocache) {
      var cached = cache.get(cacheKey);
      if (cached) {
        return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
      }
    }

    var datos = obtenerDatos(sheetId, tab, limit, offset);
    var json  = JSON.stringify(datos);

    try {
      if (json.length < 95000) {
        cache.put(cacheKey, json, CACHE_TTL);
      }
    } catch(ce) {}

    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return respuesta({ error: err.toString() });
  }
}

function obtenerDatos(sheetId, tabName, limit, offset) {
  limit  = limit  || 0;
  offset = offset || 0;

  var ss   = SpreadsheetApp.openById(sheetId);
  var hoja = ss.getSheetByName(tabName);
  if (!hoja) return { error: 'Pestana no encontrada: ' + tabName };

  var totalFilas = hoja.getLastRow();
  var totalCols  = hoja.getLastColumn();
  if (totalFilas === 0 || totalCols === 0) return [];

  // Leer cabeceras (fila 1 siempre)
  var cabecerasRaw = hoja.getRange(1, 1, 1, totalCols).getValues()[0]
    .map(function(h) { return String(h).trim(); });

  // Detectar formato KoboToolbox: fila 2 = etiquetas legibles
  var cabeceras  = cabecerasRaw;
  var firstDataRow = 2; // fila de inicio de datos en 1-indexed
  var hashCount  = cabecerasRaw.filter(function(h) {
    return /^[0-9a-f]{32}$/i.test(h);
  }).length;
  if (hashCount > 0 && totalFilas > 1) {
    var etiquetas = hoja.getRange(2, 1, 1, totalCols).getValues()[0];
    cabeceras = cabecerasRaw.map(function(h, i) {
      var et = String(etiquetas[i] || '').trim();
      return et || h;
    });
    firstDataRow = 3; // datos empiezan en fila 3
  }

  // OPTIMIZACION: si pedimos limit sin offset, leer solo las ultimas filas
  var startRow, numRows;
  if (limit > 0 && offset === 0) {
    // Leer el doble para absorber posibles filas vacias/fantasma
    numRows  = Math.min(limit * 2 + 20, totalFilas - firstDataRow + 1);
    startRow = Math.max(firstDataRow, totalFilas - numRows + 1);
  } else {
    startRow = firstDataRow;
    numRows  = totalFilas - firstDataRow + 1;
  }

  if (numRows <= 0) return [];

  var matriz    = hoja.getRange(startRow, 1, numRows, totalCols).getValues();
  var idxFormId = cabeceras.indexOf('form_id');

  var filas = [];
  for (var i = 0; i < matriz.length; i++) {
    var fila  = matriz[i];
    var vacia = fila.every(function(c) { return c === '' || c === null || c === undefined; });
    if (vacia) continue;

    if (idxFormId >= 0) {
      var fv = fila[idxFormId];
      if (fv === '' || fv === null || fv === undefined) continue;
    }

    var obj = {};
    for (var j = 0; j < cabeceras.length; j++) {
      var val = fila[j];
      obj[cabeceras[j]] = (val instanceof Date) ? val.toISOString().split('T')[0] : val;
    }
    filas.push(obj);
  }

  // Cortar a los ultimos 'limit' registros validos
  if (limit > 0) {
    if (offset > 0) {
      filas = filas.slice(offset, offset + limit);
    } else {
      filas = filas.slice(Math.max(0, filas.length - limit));
    }
  }

  return filas;
}

function respuesta(datos) {
  return ContentService
    .createTextOutput(JSON.stringify(datos))
    .setMimeType(ContentService.MimeType.JSON);
}

// =============================================================
// INSTRUCCIONES DE DESPLIEGUE
// =============================================================
// 1. Ir a script.google.com con enlace@enlacecanarias.com
// 2. Abrir el proyecto > pegar este codigo
// 3. Implementar > Gestionar implementaciones > lapiz > Version nueva
// 4. La URL del endpoint no cambia entre versiones
//
// ENDPOINTS:
//   ?sheet=gpv&tab=Copia Visitas&limit=200   → ultimas 200 visitas (rapido)
//   ?sheet=gpv&tab=Copia Visitas             → todas las visitas
//   ?alias=visitas&limit=200                 → igual, via alias
//   ?alias=ecommerce                         → Ecommerce completo
//   &nocache=1                               → saltar cache
// =============================================================
