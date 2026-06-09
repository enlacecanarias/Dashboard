#!/bin/bash
cd "$(dirname "$0")"
echo "Iniciando actualización de Centro y Cadena en Firebase..."
echo ""
python3 actualizar_centro_cadena.py
echo ""
echo "Proceso finalizado. Puedes cerrar esta ventana."
read -p "Pulsa Enter para cerrar..."
