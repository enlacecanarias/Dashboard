#!/usr/bin/env python3
"""
Actualiza Centro y Cadena en Firebase Firestore (prod_14500 → prod_25043).
Lee datos directamente desde el endpoint de Apps Script (no necesita CSV).
"""

import json
import ssl
import urllib.request
import urllib.error
import time

# Fix SSL certificates en macOS con Python instalado manualmente
ssl._create_default_https_context = ssl._create_unverified_context

# ── Configuración ──────────────────────────────────────────────
FIREBASE_API_KEY  = "AIzaSyAVgnw2V2Tc9f-IHuvoJKNGyroFIfg2XlY"
PROJECT_ID        = "enlace-canarias"
COLLECTION        = "productos_arias"
INICIO            = 14500
FIN               = 25044   # exclusive

APPS_SCRIPT_URL   = (
    "https://script.google.com/macros/s/"
    "AKfycbw94WIrUb1KQqgnWF7XWge7LXU3OZ5sJlkcAIs4KtgCMgl6uNEkbPPVaglkCFUVOyCJ"
    "/exec"
)
BATCH_SIZE_FETCH  = 500    # filas por peticion al endpoint
BATCH_SIZE_WRITE  = 400    # documentos por batch a Firebase
# ───────────────────────────────────────────────────────────────


def get_firebase_token():
    url  = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={FIREBASE_API_KEY}"
    data = json.dumps({"returnSecureToken": True}).encode()
    req  = urllib.request.Request(url, data=data,
                                  headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())["idToken"]
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise Exception(f"Firebase Auth {e.code}: {body}")


def fetch_rows(offset, limit):
    """Obtiene filas del endpoint de Apps Script (alias productos_pvp)."""
    url = (f"{APPS_SCRIPT_URL}?alias=productos_pvp"
           f"&offset={offset}&limit={limit}&nocache=1")
    req = urllib.request.Request(url, headers={"User-Agent": "python/3"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read())
    # El endpoint devuelve {rows:[...], headers:[...]} o lista directa
    if isinstance(data, dict):
        return data.get("rows", data.get("data", []))
    return data  # lista directa


def patch_batch(token, writes):
    """Actualiza un lote de docs con batchWrite de Firestore."""
    url  = (f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}"
            f"/databases/(default)/documents:batchWrite")
    body = {"writes": writes}
    data = json.dumps(body).encode()
    req  = urllib.request.Request(
        url, data=data, method="POST",
        headers={
            "Content-Type":  "application/json",
            "Authorization": f"Bearer {token}"
        }
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


def build_write(doc_idx, centro, cadena):
    """Construye una operación update con updateMask."""
    name = (f"projects/{PROJECT_ID}/databases/(default)"
            f"/documents/{COLLECTION}/prod_{doc_idx}")
    return {
        "update": {
            "name": name,
            "fields": {
                "Centro": {"stringValue": centro},
                "Cadena": {"stringValue": cadena}
            }
        },
        "updateMask": {"fieldPaths": ["Centro", "Cadena"]}
    }


def main():
    print("─" * 55)
    print("  Actualizar Centro y Cadena — Firebase Firestore")
    print(f"  Rango: prod_{INICIO} → prod_{FIN - 1}")
    print("─" * 55)

    # 1. Token Firebase
    print("\n[1] Obteniendo token Firebase...", end=" ", flush=True)
    token = get_firebase_token()
    token_time = time.time()
    print("OK")

    total_actualizados = 0
    total_saltados     = 0
    writes_buffer      = []

    def flush_writes():
        nonlocal total_actualizados
        if not writes_buffer:
            return
        patch_batch(token, writes_buffer)
        total_actualizados += len(writes_buffer)
        writes_buffer.clear()

    # 2. Leer en bloques y acumular escrituras
    print(f"[2] Leyendo datos y actualizando Firebase...")
    print()

    offset = INICIO
    while offset < FIN:
        limit = min(BATCH_SIZE_FETCH, FIN - offset)

        # Refrescar token cada ~45 min
        if time.time() - token_time > 2700:
            token = get_firebase_token()
            token_time = time.time()

        try:
            rows = fetch_rows(offset, limit)
        except Exception as e:
            print(f"  ERROR al leer filas {offset}-{offset+limit}: {e}")
            print("  Reintentando en 5s...")
            time.sleep(5)
            try:
                rows = fetch_rows(offset, limit)
            except Exception as e2:
                print(f"  Fallo definitivo: {e2}")
                break

        if not rows:
            print(f"  Sin datos en offset {offset}, terminando.")
            break

        for row_i, row in enumerate(rows):
            doc_idx = offset + row_i

            # Detectar columnas Centro y Cadena (insensible a mayúsculas)
            centro = ""
            cadena = ""
            if isinstance(row, dict):
                for k, v in row.items():
                    kl = k.strip().lower()
                    if kl == "centro":
                        centro = str(v).strip()
                    elif kl == "cadena":
                        cadena = str(v).strip()
            elif isinstance(row, list):
                # fallback: col R=17, col Z=25
                if len(row) > 25:
                    centro = str(row[17]).strip()
                    cadena = str(row[25]).strip()

            if not centro or centro.startswith("#") or not cadena or cadena.startswith("#"):
                total_saltados += 1
                continue

            writes_buffer.append(build_write(doc_idx, centro, cadena))

            if len(writes_buffer) >= BATCH_SIZE_WRITE:
                try:
                    flush_writes()
                    pct = (total_actualizados) / (FIN - INICIO) * 100
                    print(f"  {total_actualizados:>6} / {FIN - INICIO}  ({pct:.0f}%)"
                          f"  — último: prod_{doc_idx}")
                    time.sleep(0.3)
                except urllib.error.HTTPError as e:
                    if e.code == 429:
                        print(f"\n  CUOTA AGOTADA en prod_{doc_idx}.")
                        print(f"  Actualizados: {total_actualizados}. Ejecuta mañana con INICIO={doc_idx}.")
                        return
                    else:
                        print(f"  ERROR HTTP {e.code}: {e.reason}")

        offset += len(rows)

    # Vaciar buffer final
    try:
        flush_writes()
    except Exception as e:
        print(f"  Error en flush final: {e}")

    print()
    print("─" * 55)
    print(f"  Actualizados : {total_actualizados}")
    print(f"  Saltados     : {total_saltados}")
    print("─" * 55)
    print("\nFinalizado.")


if __name__ == "__main__":
    main()
