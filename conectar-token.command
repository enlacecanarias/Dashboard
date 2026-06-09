#!/bin/bash
# Sube el proyecto a GitHub usando el token que tengas copiado en el portapapeles.
# Antes de hacer doble clic: genera el token en GitHub y pulsa el boton de copiar.
# Este script lo lee solo del portapapeles, no hay que escribirlo ni pegarlo a mano.

cd "$(dirname "$0")"
echo "== Conectando con GitHub =="

TOKEN="$(pbpaste | tr -d '[:space:]')"

if [ -z "$TOKEN" ]; then
  echo "El portapapeles esta vacio. Copia primero el token en GitHub (boton copiar) y vuelve a hacer doble clic."
  read -p "Pulsa Enter para cerrar..."
  exit 1
fi

# Asegura identidad y rama
git config --global user.name "enlacecanarias"
git config --global user.email "enlace@enlacecanarias.com"
git branch -M main 2>/dev/null

# Asegura que el remoto apunta al repo (URL limpia, sin token)
git remote set-url origin "https://github.com/enlacecanarias/Dashboard.git" 2>/dev/null || \
  git remote add origin "https://github.com/enlacecanarias/Dashboard.git"

# Guarda el token en el Llavero de macOS (seguro) para no volver a pedirlo
printf 'protocol=https\nhost=github.com\nusername=enlacecanarias\npassword=%s\n\n' "$TOKEN" | git credential-osxkeychain store
git config --global credential.helper osxkeychain

echo "Subiendo..."
git push -u origin main

echo ""
echo "Si no hubo errores, en 1-2 minutos tu web estara en:"
echo "  https://enlacecanarias.github.io/Dashboard/"
echo "Luego activa GitHub Pages en Settings > Pages > Branch: main > Save."
read -p "Pulsa Enter para cerrar..."
