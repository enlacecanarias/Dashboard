#!/bin/bash
# Publica en GitHub los cambios del Dashboard. Doble clic cada vez que quieras actualizar la web.
# Usa el token ya guardado en el Llavero, asi que no vuelve a pedirlo.

cd "$(dirname "$0")"
echo "== Publicando cambios en GitHub =="

git add -A

if git diff --cached --quiet; then
  echo "No hay cambios nuevos que subir."
else
  git commit -m "actualizacion $(date '+%Y-%m-%d %H:%M')"
  git push
  echo ""
  echo "Hecho. En 1-2 minutos se actualiza https://enlacecanarias.github.io/Dashboard/"
fi
read -p "Pulsa Enter para cerrar..."
