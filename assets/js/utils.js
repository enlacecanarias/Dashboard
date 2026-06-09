// utils.js - Funciones comunes para todos los dashboards

// URL del Apps Script (se sobreescribe en cada dashboard)
window.APPS_SCRIPT_URL = '';

// Cache de datos cargados
const _cache = {};

/**
 * Carga datos desde el Apps Script Web App.
 * @param {string} sheet  - 'gpv' o 'ecommerce'
 * @param {string} tab    - Nombre de la pestaña
 * @param {number} limit  - Nº máximo de registros (0 = todos, devuelve los últimos N)
 * @returns {Promise<Array>} Array de objetos
 */
async function cargarDatos(sheet, tab, limit = 0) {
  const clave = `${sheet}::${tab}::${limit}`;
  if (_cache[clave]) return _cache[clave];

  let url = `${window.APPS_SCRIPT_URL}?sheet=${encodeURIComponent(sheet)}&tab=${encodeURIComponent(tab)}`;
  if (limit > 0) url += `&limit=${limit}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Error ${resp.status} al cargar ${sheet}/${tab}`);

  const datos = await resp.json();
  if (datos.error) throw new Error(datos.error);

  _cache[clave] = datos;
  return datos;
}

/**
 * Invalida la cache de una pestaña concreta o toda la cache.
 */
function limpiarCache(sheet, tab) {
  if (sheet && tab) delete _cache[`${sheet}::${tab}`];
  else Object.keys(_cache).forEach(k => delete _cache[k]);
}

// Alias para compatibilidad con la convención del proyecto
async function leerGoogleSheet(sheetAlias, tab) {
  return cargarDatos(sheetAlias, tab);
}

// ── Formateo ─────────────────────────────────────────────

function formatearPrecio(v) {
  if (v == null || v === '') return '-';
  const n = parseFloat(String(v).replace(',', '.'));
  if (isNaN(n)) return v;
  return n.toFixed(2).replace('.', ',') + ' €';
}

function formatearNumero(v, decimales = 0) {
  if (v == null || v === '') return '-';
  const n = parseFloat(String(v).replace(',', '.'));
  if (isNaN(n)) return v;
  return n.toLocaleString('es-ES', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

function formatearFecha(v) {
  if (!v) return '-';
  if (v instanceof Date) return v.toLocaleDateString('es-ES');
  const d = new Date(v);
  if (!isNaN(d)) return d.toLocaleDateString('es-ES');
  return String(v);
}

/**
 * Formatea duración almacenada como timestamp Excel (1899-12-30THH:MM:SS.000Z)
 */
function formatearDuracion(v) {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  if (h === 0 && m === 0) return '-';
  if (h === 0) return `${m}min`;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

function formatearPorcentaje(v) {
  if (v == null || v === '') return '-';
  const n = parseFloat(String(v).replace(',', '.'));
  if (isNaN(n)) return v;
  return n.toFixed(1) + '%';
}

// ── Filtros ───────────────────────────────────────────────

/**
 * Obtiene valores únicos de una columna de un array de datos.
 */
function valoresUnicos(datos, columna) {
  const set = new Set();
  datos.forEach(row => {
    const v = row[columna];
    if (v == null || v === '') return;
    const s = String(v).trim();
    // Descartar celdas vacías tras trim y errores de fórmula de Google Sheets (#N/A, #REF!, etc.)
    if (s === '' || s.startsWith('#')) return;
    set.add(s);
  });
  return [...set].sort();
}

/**
 * Rellena un <select> con los valores únicos de una columna.
 */
function rellenarSelect(selectId, datos, columna, etiquetaTodos = 'Todos') {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = `<option value="">${etiquetaTodos}</option>`;
  valoresUnicos(datos, columna).forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
}

/**
 * Filtra un array de datos por un mapa de {columna: valor}.
 * Valores vacíos ('') no filtran.
 */
function filtrarDatos(datos, filtros) {
  return datos.filter(row => {
    return Object.entries(filtros).every(([col, val]) => {
      if (!val) return true;
      return String(row[col] ?? '').toLowerCase() === String(val).toLowerCase();
    });
  });
}

/**
 * Filtra por rango de fechas.
 */
function filtrarPorFecha(datos, columnaFecha, desde, hasta) {
  if (!desde && !hasta) return datos;
  return datos.filter(row => {
    const f = new Date(row[columnaFecha]);
    if (isNaN(f)) return true;
    if (desde && f < new Date(desde)) return false;
    if (hasta && f > new Date(hasta)) return false;
    return true;
  });
}

// ── Colores cadenas ───────────────────────────────────────

const COLORES_CADENAS = {
  'ALCAMPO':        '#2563d4',
  'ALTEZA':         '#0f766e',
  'CARREFOUR':      '#dc2626',
  'EL CORTE INGLES':'#d97706',
  'HIPERDINO':      '#1aaa6e',
  'EUROSPAR':       '#1aaa6e',
  'SPAR':           '#7c3aed',
  'TU TREBOL':      '#be185d',
};

const PALETA = ['#2563d4','#1aaa6e','#d97706','#dc2626','#7c3aed','#0891b2','#be185d','#0f766e','#ca8a04'];

function colorCadena(nombre) {
  if (!nombre) return PALETA[0];
  const clave = String(nombre).toUpperCase();
  for (const [key, color] of Object.entries(COLORES_CADENAS)) {
    if (clave.includes(key)) return color;
  }
  return PALETA[Object.keys(COLORES_CADENAS).length % PALETA.length];
}

function coloresParaLista(lista) {
  return lista.map((nombre, i) => colorCadena(nombre) || PALETA[i % PALETA.length]);
}

// ── Chart.js helpers ──────────────────────────────────────

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: '#5b6080', font: { size: 11 }, boxWidth: 12 }
    },
    tooltip: {
      backgroundColor: '#ffffff',
      borderColor: '#e0e3f0',
      borderWidth: 1,
      titleColor: '#1a1c2e',
      bodyColor: '#5b6080',
    }
  },
  scales: {
    x: {
      ticks: { color: '#5b6080', font: { size: 11 } },
      grid: { color: 'rgba(224,227,240,0.8)' },
    },
    y: {
      ticks: { color: '#5b6080', font: { size: 11 } },
      grid: { color: 'rgba(224,227,240,0.8)' },
    }
  }
};

const _charts = {};

/**
 * Crea o actualiza un gráfico Chart.js.
 */
function crearGrafica(canvasId, tipo, datos, opciones = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  if (_charts[canvasId]) {
    _charts[canvasId].destroy();
    delete _charts[canvasId];
  }

  // Clonar CHART_DEFAULTS correctamente (preserva funciones)
  const base = clonarOpts(CHART_DEFAULTS);
  const opcionesMerge = mergeDeep(base, opciones);

  _charts[canvasId] = new Chart(canvas, { type: tipo, data: datos, options: opcionesMerge });
  return _charts[canvasId];
}

/** Clon profundo que preserva funciones (no usar JSON.parse que las pierde) */
function clonarOpts(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const result = {};
  for (const k of Object.keys(obj)) {
    result[k] = (typeof obj[k] === 'function') ? obj[k] : clonarOpts(obj[k]);
  }
  return result;
}

/**
 * Deep merge de objetos (para opciones de Chart.js).
 */
function mergeDeep(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      mergeDeep(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// ── Tabla con paginación ──────────────────────────────────

/**
 * Renderiza una tabla paginada dentro de un contenedor.
 * @param {string} contenedorId - ID del elemento contenedor
 * @param {Array} columnas - [{key, label, formato}]
 * @param {Array} datos - Array de objetos
 * @param {number} filasPorPagina
 */
function renderizarTabla(contenedorId, columnas, datos, filasPorPagina = 50) {
  const contenedor = document.getElementById(contenedorId);
  if (!contenedor) return;

  let pagina = 1;

  function render() {
    const total = datos.length;
    const inicio = (pagina - 1) * filasPorPagina;
    const fin = Math.min(inicio + filasPorPagina, total);
    const filas = datos.slice(inicio, fin);

    contenedor.innerHTML = '';

    if (total === 0) {
      contenedor.innerHTML = '<div class="sin-datos">Sin datos para mostrar</div>';
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'tabla-contenedor';

    const tabla = document.createElement('table');
    const thead = document.createElement('thead');
    const trHead = document.createElement('tr');
    columnas.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col.label;
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);

    const tbody = document.createElement('tbody');
    filas.forEach(row => {
      const tr = document.createElement('tr');
      columnas.forEach(col => {
        const td = document.createElement('td');
        const val = row[col.key];
        td.innerHTML = col.formato ? col.formato(val, row) : (val ?? '-');
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    tabla.appendChild(thead);
    tabla.appendChild(tbody);
    wrapper.appendChild(tabla);
    contenedor.appendChild(wrapper);

    if (total > filasPorPagina) {
      const pag = document.createElement('div');
      pag.className = 'paginacion';
      pag.innerHTML = `
        <span>${inicio + 1} - ${fin} / ${total}</span>
        <button onclick="this.parentElement._prev()" ${pagina === 1 ? 'disabled' : ''}>&lsaquo; Anterior</button>
        <button onclick="this.parentElement._next()" ${fin >= total ? 'disabled' : ''}>Siguiente &rsaquo;</button>
      `;
      pag._prev = () => { if (pagina > 1) { pagina--; render(); } };
      pag._next = () => { if (fin < total) { pagina++; render(); } };
      contenedor.appendChild(pag);
    }
  }

  render();
}

// ── Utilidades generales ──────────────────────────────────

function mostrarCargando(id, mensaje = 'Cargando datos...') {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<div class="cargando"><div class="spinner"></div>${mensaje}</div>`;
}

function mostrarError(id, mensaje) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<div class="error-msg">${mensaje}</div>`;
}

function badgeCadena(nombre) {
  if (!nombre) return '';
  const n = String(nombre).toUpperCase();
  let clase = 'badge';
  if (n.includes('ALCAMPO'))                          clase += ' badge-alcampo';
  else if (n.includes('ALTEZA'))                      clase += ' badge-alteza';
  else if (n.includes('CARREFOUR'))                   clase += ' badge-carrefour';
  else if (n.includes('HIPERDINO') || n.includes('EUROSPAR')) clase += ' badge-hiperdino';
  else if (n.includes('CORTE INGLES') || n.includes('CORTE INGLÉS')) clase += ' badge-corte';
  else if (n.includes('SPAR'))                        clase += ' badge-spar';
  else if (n.includes('TREBOL'))                      clase += ' badge-trebol';
  else                                                clase += ' badge-alcampo';
  return `<span class="${clase}">${nombre}</span>`;
}

function badgeRotura(v) {
  const val = String(v ?? '').toUpperCase();
  if (val === 'SI' || val === 'SÍ' || val === 'TRUE' || val === '1') {
    return '<span class="badge badge-si">Sí</span>';
  }
  return '<span class="badge badge-no">No</span>';
}

// Función de agrupación
function agruparPor(datos, columna) {
  const mapa = {};
  datos.forEach(row => {
    const key = row[columna] ?? 'Sin definir';
    if (!mapa[key]) mapa[key] = [];
    mapa[key].push(row);
  });
  return mapa;
}

// Suma de una columna numérica
function sumarColumna(datos, columna) {
  return datos.reduce((acc, row) => {
    const v = parseFloat(String(row[columna] ?? '0').replace(',', '.'));
    return acc + (isNaN(v) ? 0 : v);
  }, 0);
}

// Media de una columna numérica
function mediaColumna(datos, columna) {
  const validos = datos.filter(row => {
    const v = parseFloat(String(row[columna] ?? '').replace(',', '.'));
    return !isNaN(v);
  });
  if (validos.length === 0) return 0;
  return sumarColumna(validos, columna) / validos.length;
}

// Cuenta de filas
function contarFilas(datos) {
  return datos.length;
}
