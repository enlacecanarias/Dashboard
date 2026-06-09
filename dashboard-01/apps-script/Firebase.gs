// =============================================================
// FIREBASE SYNC - Dashboard Arias
// Sistema de doble trigger: onChange + horario cada 1 hora
// Versión robusta con auto-reparación y verificación
// =============================================================

var FIREBASE_CONFIG = {
  projectId: 'enlace-canarias',
  apiKey:    'AIzaSyAVgnw2V2Tc9f-IHuvoJKNGyroFIfg2XlY'
};

// Registros recientes a sincronizar en cada ejecución incremental
var SYNC_RECIENTES = 200;

// ─── AUTH ─────────────────────────────────────────────────────
function getToken() {
  return ScriptApp.getOAuthToken();
}

// ─── TIPO FIRESTORE ───────────────────────────────────────────
function toFirestoreFields(obj) {
  var fields = {};
  for (var key in obj) {
    if (!key || !String(key).trim()) continue;
    var val = obj[key];
    if (val === null || val === undefined || val === '') {
      fields[key] = { nullValue: null };
    } else if (typeof val === 'boolean') {
      fields[key] = { booleanValue: val };
    } else if (typeof val === 'number') {
      fields[key] = { doubleValue: val };
    } else {
      fields[key] = { stringValue: String(val) };
    }
  }
  return fields;
}

// ─── ESCRIBIR UN DOCUMENTO ────────────────────────────────────
function escribirDocumento(coleccion, docId, datos) {
  var url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_CONFIG.projectId +
            '/databases/(default)/documents/' + coleccion + '/' + docId;
  var resp = UrlFetchApp.fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': 'Bearer ' + getToken(),
      'Content-Type':  'application/json'
    },
    payload:           JSON.stringify({ fields: toFirestoreFields(datos) }),
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() >= 400) {
    Logger.log('Error escribiendo ' + coleccion + '/' + docId + ': ' + resp.getContentText());
  }
}

// ─── BATCH WRITE (500 docs por peticion) ──────────────────────
function batchWriteDocumentos(coleccion, documentos) {
  // Deduplicar por docId
  var docMap = {};
  documentos.forEach(function(d) { docMap[d.docId] = d; });
  documentos = Object.keys(docMap).map(function(k) { return docMap[k]; });
  Logger.log(coleccion + ': ' + documentos.length + ' docs a escribir');

  var BATCH_SIZE = 500;
  var projectId  = FIREBASE_CONFIG.projectId;
  var batchUrl   = 'https://firestore.googleapis.com/v1/projects/' + projectId +
                   '/databases/(default)/documents:batchWrite';
  var token      = getToken();

  for (var i = 0; i < documentos.length; i += BATCH_SIZE) {
    var lote   = documentos.slice(i, i + BATCH_SIZE);
    var writes = lote.map(function(doc) {
      return {
        update: {
          name:   'projects/' + projectId + '/databases/(default)/documents/' +
                  coleccion + '/' + doc.docId,
          fields: toFirestoreFields(doc.datos)
        }
      };
    });

    var resp = UrlFetchApp.fetch(batchUrl, {
      method:            'POST',
      headers:           { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      payload:           JSON.stringify({ writes: writes }),
      muteHttpExceptions: true
    });

    var code = resp.getResponseCode();
    if (code >= 400) {
      Logger.log('Error batch ' + coleccion + ' [' + i + '-' + (i + lote.length - 1) + ']: ' +
                 resp.getContentText().substring(0, 200));
    } else {
      Logger.log('Batch OK: ' + coleccion + ' docs ' + i + '-' + (i + lote.length - 1));
    }

    if (i + BATCH_SIZE < documentos.length) Utilities.sleep(2000);
  }
}

// =============================================================
// TRIGGER 1: onChange — cambios manuales en el Sheet
// Se instala con instalarTriggers()
// =============================================================
function onSheetChange(e) {
  try {
    var hoja   = e.source.getActiveSheet();
    var nombre = hoja.getName();
    Logger.log('[onChange] Hoja modificada: ' + nombre);

    if (nombre === 'Copia Visitas')   sincronizarVisitas(false);
    if (nombre === 'Copia Productos') sincronizarProductos(false);
    if (nombre === 'Ecommerce')       sincronizarEcommerce(false);
    if (nombre === 'Centros')         sincronizarCentros(false);

  } catch(err) {
    Logger.log('[onChange] Error: ' + err.toString());
  }
}

// =============================================================
// TRIGGER 2: horario — cada 1 hora como respaldo
// Garantiza sincronización aunque el Sheet se actualice
// por formularios, APIs externas o scripts (no dispara onChange)
// =============================================================
function sincronizacionHoraria() {
  Logger.log('[Horaria] ' + new Date().toISOString() + ' — Iniciando...');
  try {
    sincronizarVisitas(false);
    sincronizarProductos(false);
    sincronizarEcommerce(false);
    Logger.log('[Horaria] Completada correctamente.');
  } catch(err) {
    Logger.log('[Horaria] Error: ' + err.toString());
  }
}

// =============================================================
// INSTALAR AMBOS TRIGGERS
// Ejecutar UNA VEZ para activar el sistema completo.
// Borra triggers anteriores antes de instalar los nuevos.
// =============================================================
function instalarTriggers() {
  // Eliminar todos los triggers existentes
  var existentes = ScriptApp.getProjectTriggers();
  existentes.forEach(function(t) { ScriptApp.deleteTrigger(t); });
  Logger.log('Triggers anteriores eliminados: ' + existentes.length);

  // Trigger onChange (cambios manuales en el Sheet GPV)
  ScriptApp.newTrigger('onSheetChange')
    .forSpreadsheet(SHEET_IDS.gpv)
    .onChange()
    .create();
  Logger.log('Trigger onChange instalado para GPV.');

  // Trigger horario cada 1 hora (respaldo para cambios programaticos)
  ScriptApp.newTrigger('sincronizacionHoraria')
    .timeBased()
    .everyHours(1)
    .create();
  Logger.log('Trigger horario (cada 1h) instalado.');

  Logger.log('SISTEMA ACTIVO: onChange + horario. Dashboard sincronizado automaticamente.');
}

// Alias retrocompatible con versiones anteriores
function instalarTrigger() { instalarTriggers(); }

// =============================================================
// AUTO-REPARACION
// Detecta si faltan triggers y los reinstala automaticamente.
// Instalar este trigger adicional: diario a las 8am.
// =============================================================
function autoRepararTriggers() {
  var triggers     = ScriptApp.getProjectTriggers();
  var nombres      = triggers.map(function(t) { return t.getHandlerFunction(); });
  var tieneChange  = nombres.indexOf('onSheetChange')       >= 0;
  var tieneHorario = nombres.indexOf('sincronizacionHoraria') >= 0;

  if (!tieneChange || !tieneHorario) {
    Logger.log('[AutoReparar] Triggers faltantes. Reinstalando...');
    instalarTriggers();
  } else {
    Logger.log('[AutoReparar] Todos los triggers OK: ' + nombres.join(', '));
  }
}

// =============================================================
// VERIFICACION DE SALUD
// Ejecutar para diagnosticar problemas de sincronizacion.
// Lee el log de ejecuciones para ver el resultado.
// =============================================================
function verificarSalud() {
  Logger.log('=== VERIFICACION DE SALUD — ' + new Date().toISOString() + ' ===');

  // --- Triggers ---
  var triggers = ScriptApp.getProjectTriggers();
  Logger.log('Triggers activos: ' + triggers.length);
  var tieneChange  = false;
  var tieneHorario = false;
  triggers.forEach(function(t) {
    Logger.log('  Trigger: ' + t.getHandlerFunction() + ' [tipo: ' + t.getEventType() + ']');
    if (t.getHandlerFunction() === 'onSheetChange')         tieneChange  = true;
    if (t.getHandlerFunction() === 'sincronizacionHoraria') tieneHorario = true;
  });

  if (!tieneChange)  Logger.log('  PROBLEMA: falta trigger onChange → ejecuta instalarTriggers()');
  if (!tieneHorario) Logger.log('  PROBLEMA: falta trigger horario → ejecuta instalarTriggers()');
  if (tieneChange && tieneHorario) Logger.log('  OK: ambos triggers activos.');

  // --- Acceso a Sheets ---
  try {
    var ss       = SpreadsheetApp.openById(SHEET_IDS.gpv);
    var hojaProd = ss.getSheetByName('Copia Productos');
    var hojaVis  = ss.getSheetByName('Copia Visitas');
    Logger.log('Sheet GPV accesible.');
    Logger.log('  Copia Productos: ' + hojaProd.getLastRow() + ' filas totales');
    Logger.log('  Copia Visitas:   ' + hojaVis.getLastRow() + ' filas totales');
  } catch(err) {
    Logger.log('ERROR accediendo a Sheets: ' + err.toString());
  }

  // --- Acceso a Firestore ---
  try {
    var url  = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_CONFIG.projectId +
               '/databases/(default)/documents/visitas_arias?pageSize=1';
    var resp = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': 'Bearer ' + getToken() },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() === 200) {
      Logger.log('Firestore accesible.');
    } else {
      Logger.log('ERROR Firestore: ' + resp.getResponseCode() + ' — ' + resp.getContentText().substring(0, 100));
    }
  } catch(err) {
    Logger.log('ERROR conectando a Firestore: ' + err.toString());
  }

  Logger.log('=== FIN VERIFICACION ===');
}

// =============================================================
// SINCRONIZACION POR COLECCION
// completa=true → carga todos los registros (carga inicial)
// completa=false → sincroniza los SYNC_RECIENTES mas recientes
// =============================================================
function sincronizarVisitas(completa) {
  var ss    = SpreadsheetApp.openById(SHEET_IDS.gpv);
  var hoja  = ss.getSheetByName('Copia Visitas');
  var datos = obtenerFilasParaFirebase(hoja);
  Logger.log('Visitas en Sheet: ' + datos.length);

  var lote = completa ? datos : datos.slice(-SYNC_RECIENTES);
  var docs  = lote.map(function(row, i) {
    return { docId: String(row['form_id'] || row['_idx'] || i), datos: row };
  }).filter(function(d) { return d.docId; });

  batchWriteDocumentos('visitas_arias', docs);
  Logger.log('Visitas sincronizadas: ' + docs.length);
}

function sincronizarProductos(completa) {
  var ss    = SpreadsheetApp.openById(SHEET_IDS.gpv);
  var hoja  = ss.getSheetByName('Copia Productos');
  var datos = obtenerFilasParaFirebase(hoja);
  Logger.log('Productos en Sheet: ' + datos.length);

  var docs = datos.map(function(row, i) {
    return { docId: 'prod_' + i, datos: row };
  });

  var lote = completa ? docs : docs.slice(-SYNC_RECIENTES);
  batchWriteDocumentos('productos_arias', lote);
  Logger.log('Productos sincronizados: ' + lote.length);
}

function sincronizarEcommerce(completa) {
  var ss    = SpreadsheetApp.openById(SHEET_IDS.ecommerce);
  var hoja  = ss.getSheetByName('Ecommerce');
  var datos = obtenerFilasParaFirebase(hoja);
  Logger.log('Ecommerce en Sheet: ' + datos.length);

  var docs = datos.map(function(row, i) {
    return { docId: String(row['form_id'] || ('eco_' + i)), datos: row };
  });

  var lote = completa ? docs : docs.slice(-SYNC_RECIENTES);
  batchWriteDocumentos('ecommerce_arias', lote);
  Logger.log('Ecommerce sincronizado: ' + lote.length);
}

function sincronizarCentros(completa) {
  var ss    = SpreadsheetApp.openById(SHEET_IDS.gpv);
  var hoja  = ss.getSheetByName('Centros');
  if (!hoja) { Logger.log('Pestana Centros no encontrada'); return; }
  var datos = obtenerFilasParaFirebase(hoja);
  Logger.log('Centros en Sheet: ' + datos.length);

  var docs = datos.map(function(row, i) {
    var nombre = row['Centro'] || row['Nombre'] || row['CENTRO'] || ('centro_' + i);
    return {
      docId: String(nombre).trim().replace(/[\/\.#\[\]\*]/g, '_'),
      datos: row
    };
  }).filter(function(d) { return d.docId && d.docId !== ''; });

  batchWriteDocumentos('centros_arias', docs);
  Logger.log('Centros sincronizados: ' + docs.length);
}

// =============================================================
// CARGAS INICIALES (ejecutar manualmente tras reset de datos)
// =============================================================
function cargaInicialCompleta() {
  Logger.log('=== CARGA INICIAL COMPLETA ===');
  sincronizarVisitas(true);
  sincronizarProductos(true);
  sincronizarEcommerce(true);
  sincronizarCentros(true);
  Logger.log('=== CARGA COMPLETA TERMINADA ===');
}

function cargaProductos()  { sincronizarProductos(true); }
function cargaEcommerce()  { sincronizarEcommerce(true); }
function cargaCentros()    { sincronizarCentros(true); }

// =============================================================
// CARGA PENDIENTE (cuando la carga inicial supera 20.000 docs/dia)
// =============================================================
function cargaProductosPendientes() {
  var INICIO = 20000;
  var ss     = SpreadsheetApp.openById(SHEET_IDS.gpv);
  var hoja   = ss.getSheetByName('Copia Productos');
  var datos  = obtenerFilasParaFirebase(hoja);

  var pendientes = datos.slice(INICIO);
  Logger.log('Cargando ' + pendientes.length + ' productos desde prod_' + INICIO);

  var docs = pendientes.map(function(row, i) {
    return { docId: 'prod_' + (INICIO + i), datos: row };
  });

  batchWriteDocumentos('productos_arias', docs);
  Logger.log('Carga pendiente completa: prod_' + INICIO + ' a prod_' + (INICIO + docs.length - 1));
}

// =============================================================
// ACTUALIZAR SOLO CENTRO Y CADENA (campo a campo, sin sobreescribir)
// =============================================================
function actualizarCentroCadena() {
  var INICIO = 14500;
  var MAX    = 20000;

  var ss    = SpreadsheetApp.openById(SHEET_IDS.gpv);
  var hoja  = ss.getSheetByName('Copia Productos');
  var datos = obtenerFilasParaFirebase(hoja);

  var primeraFila = datos[0] || {};
  var campoCentro = ['Centro', 'CENTRO', 'Nombre Centro'].find(function(k) { return k in primeraFila; });
  var campoCadena = ['Cadena', 'CADENA'].find(function(k) { return k in primeraFila; });

  if (!campoCentro || !campoCadena) {
    Logger.log('ERROR: campos no encontrados. Disponibles: ' + Object.keys(primeraFila).join(', '));
    return;
  }
  Logger.log('Campos: Centro="' + campoCentro + '", Cadena="' + campoCadena + '"');

  var lote       = datos.slice(INICIO, INICIO + MAX);
  var BATCH_SIZE = 500;
  var projectId  = FIREBASE_CONFIG.projectId;
  var batchUrl   = 'https://firestore.googleapis.com/v1/projects/' + projectId +
                   '/databases/(default)/documents:batchWrite';
  var token      = getToken();

  Logger.log('Actualizando prod_' + INICIO + ' a prod_' + (INICIO + lote.length - 1));

  for (var i = 0; i < lote.length; i += BATCH_SIZE) {
    var chunk  = lote.slice(i, i + BATCH_SIZE);
    var writes = chunk.map(function(row, j) {
      var docIdx  = INICIO + i + j;
      var vCentro = row[campoCentro];
      var vCadena = row[campoCadena];
      var campos  = {};
      campos[campoCentro] = (vCentro == null || vCentro === '')
        ? { nullValue: null } : { stringValue: String(vCentro) };
      campos[campoCadena] = (vCadena == null || vCadena === '')
        ? { nullValue: null } : { stringValue: String(vCadena) };
      return {
        update: {
          name:   'projects/' + projectId + '/databases/(default)/documents/productos_arias/prod_' + docIdx,
          fields: campos
        },
        updateMask: { fieldPaths: [campoCentro, campoCadena] }
      };
    });

    var resp = UrlFetchApp.fetch(batchUrl, {
      method:            'POST',
      headers:           { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      payload:           JSON.stringify({ writes: writes }),
      muteHttpExceptions: true
    });

    var code = resp.getResponseCode();
    if (code >= 400) {
      Logger.log('Error [' + (INICIO+i) + '-' + (INICIO+i+chunk.length-1) + ']: ' +
                 resp.getContentText().substring(0, 300));
    } else {
      Logger.log('OK: prod_' + (INICIO+i) + ' a prod_' + (INICIO+i+chunk.length-1));
    }
    if (i + BATCH_SIZE < lote.length) Utilities.sleep(2000);
  }

  Logger.log('Actualizacion completa. Docs: ' + lote.length);
  if (INICIO + lote.length < datos.length) {
    Logger.log('PENDIENTE: cambiar INICIO=' + (INICIO + lote.length) + ' y ejecutar manana.');
  } else {
    Logger.log('Todos los productos actualizados.');
  }
}

// =============================================================
// LEER FILAS DEL SHEET → array de objetos
// =============================================================
function obtenerFilasParaFirebase(hoja) {
  var totalFilas = hoja.getLastRow();
  var totalCols  = hoja.getLastColumn();
  if (totalFilas < 2 || totalCols === 0) return [];

  var cabecerasRaw = hoja.getRange(1, 1, 1, totalCols).getValues()[0]
    .map(function(h) { return String(h).trim(); });

  var cabeceras    = cabecerasRaw;
  var firstDataRow = 2;
  var hashCount    = cabecerasRaw.filter(function(h) {
    return /^[0-9a-f]{32}$/i.test(h);
  }).length;

  if (hashCount > 0 && totalFilas > 2) {
    var etiquetas = hoja.getRange(2, 1, 1, totalCols).getValues()[0];
    cabeceras = cabecerasRaw.map(function(h, i) {
      return String(etiquetas[i] || '').trim() || h;
    });
    firstDataRow = 3;
  }

  var numRows = totalFilas - firstDataRow + 1;
  if (numRows <= 0) return [];

  var matriz    = hoja.getRange(firstDataRow, 1, numRows, totalCols).getValues();
  var idxFormId = cabeceras.indexOf('form_id');
  var filas     = [];

  for (var i = 0; i < matriz.length; i++) {
    var fila  = matriz[i];
    var vacia = fila.every(function(c) { return c === '' || c === null || c === undefined; });
    if (vacia) continue;
    if (idxFormId >= 0 && (fila[idxFormId] === '' || fila[idxFormId] == null)) continue;

    var obj = {};
    for (var j = 0; j < cabeceras.length; j++) {
      var cab = cabeceras[j];
      if (!cab || !cab.trim()) continue;
      var val = fila[j];
      obj[cab] = (val instanceof Date) ? val.toISOString().split('T')[0] : val;
    }
    filas.push(obj);
  }

  return filas;
}

// =============================================================
// ELIMINAR / DIAGNÓSTICO (uso manual)
// =============================================================

function eliminarFormId6435() {
  var projectId = FIREBASE_CONFIG.projectId;
  var token = getToken();
  var base = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents/';
  var respV = UrlFetchApp.fetch(base + 'visitas_arias/6435', {
    method: 'DELETE', headers: {'Authorization': 'Bearer ' + token}, muteHttpExceptions: true
  });
  Logger.log('visitas_arias/6435 → ' + respV.getResponseCode());
  var queryUrl = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents:runQuery';
  var query = { structuredQuery: { from: [{collectionId: 'productos_arias'}], where: { fieldFilter: { field: {fieldPath: 'form_id'}, op: 'EQUAL', value: {doubleValue: 6435} } } } };
  var respQ = UrlFetchApp.fetch(queryUrl, {method: 'POST', headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, payload: JSON.stringify(query), muteHttpExceptions: true});
  var results = JSON.parse(respQ.getContentText());
  var eliminados = 0;
  results.forEach(function(item) {
    if (item.document && item.document.name) {
      UrlFetchApp.fetch('https://firestore.googleapis.com/v1/' + item.document.name, {method: 'DELETE', headers: {'Authorization': 'Bearer ' + token}, muteHttpExceptions: true});
      eliminados++;
    }
  });
  Logger.log('Productos eliminados: ' + eliminados);
}

function eliminarVisita6438() {
  var projectId = FIREBASE_CONFIG.projectId;
  var token = getToken();
  var queryUrl = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents:runQuery';
  var query = { structuredQuery: { from: [{collectionId: 'visitas_arias'}], where: { fieldFilter: { field: {fieldPath: 'form_id'}, op: 'EQUAL', value: {doubleValue: 6438} } } } };
  var resp = UrlFetchApp.fetch(queryUrl, {method: 'POST', headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, payload: JSON.stringify(query), muteHttpExceptions: true});
  Logger.log('Query double: ' + resp.getResponseCode() + ' resultados: ' + JSON.parse(resp.getContentText()).length);
  var results = JSON.parse(resp.getContentText());
  var eliminados = 0;
  results.forEach(function(item) {
    if (item.document && item.document.name) {
      Logger.log('Encontrado: ' + item.document.name);
      UrlFetchApp.fetch('https://firestore.googleapis.com/v1/' + item.document.name, {method: 'DELETE', headers: {'Authorization': 'Bearer ' + token}, muteHttpExceptions: true});
      eliminados++;
    }
  });
  if (eliminados === 0) {
    query.structuredQuery.where.fieldFilter.value = {stringValue: '6438'};
    var resp2 = UrlFetchApp.fetch(queryUrl, {method: 'POST', headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, payload: JSON.stringify(query), muteHttpExceptions: true});
    Logger.log('Query string: ' + resp2.getResponseCode() + ' resultados: ' + JSON.parse(resp2.getContentText()).length);
    var results2 = JSON.parse(resp2.getContentText());
    results2.forEach(function(item) {
      if (item.document && item.document.name) {
        Logger.log('Encontrado: ' + item.document.name);
        UrlFetchApp.fetch('https://firestore.googleapis.com/v1/' + item.document.name, {method: 'DELETE', headers: {'Authorization': 'Bearer ' + token}, muteHttpExceptions: true});
        eliminados++;
      }
    });
  }
  Logger.log('Total eliminados: ' + eliminados);
}

function diagnosticoFirestore() {
  var projectId = FIREBASE_CONFIG.projectId;
  var token = getToken();
  var base = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents/';
  var resp1 = UrlFetchApp.fetch(base + 'visitas_arias/6438', {
    method: 'GET', headers: { 'Authorization': 'Bearer ' + token }, muteHttpExceptions: true
  });
  Logger.log('GET /6438 code: ' + resp1.getResponseCode());
  Logger.log('GET /6438 body: ' + resp1.getContentText().slice(0, 300));
  var qUrl = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents:runQuery';
  var q = { structuredQuery: { from: [{collectionId: 'visitas_arias'}], limit: 3 } };
  var resp2 = UrlFetchApp.fetch(qUrl, {method: 'POST', headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, payload: JSON.stringify(q), muteHttpExceptions: true});
  Logger.log('runQuery code: ' + resp2.getResponseCode());
  Logger.log('runQuery body: ' + resp2.getContentText().slice(0, 500));
}
