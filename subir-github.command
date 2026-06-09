#!/bin/bash
# Sube el proyecto Dashboard a GitHub por primera vez.
# Requisitos previos (los haces tú una sola vez en la web de GitHub):
#  1. Crear el repositorio publico "Dashboard" en https://github.com/new
#  2. Crear un token clasico con permiso "repo" en https://github.com/settings/tokens
# Al pedir credenciales en el push:
#  Username: enlacecanarias
#  Password: pega tu token (no tu contrasena)
# El token se guarda en el Llavero de macOS, asi que solo lo pides una vez.

cd "$(dirname "$0")"
echo "== Subiendo Dashboard a GitHub =="

# Identidad de los commits
git config --global user.name "enlacecanarias"
git config --global user.email "enlace@enlacecanarias.com"

# Si no hay repo o no hay ningun commit, inicializa limpio
if [ ! -d .git ] || ! git rev-parse HEAD >/dev/null 2>&1; then
  echo "Inicializando repositorio local..."
  rm -rf .git
  git init
  git add -A
  git commit -m "primer commit: Dashboard Arias"
  git branch -M main
  git remote remove origin 2>/dev/null
  git remote add origin https://github.com/enlacecanarias/Dashboard.git
fi

# Guarda el token en el Llavero de macOS (no en texto plano)
git config --global credential.helper osxkeychain

echo ""
echo "Subiendo... (si pide usuario/token, escribe enlacecanarias y pega tu token)"
git push -u origin main

echo ""
echo "Si no hubo errores, tu web estara en:"
echo "  https://enlacecanarias.github.io/Dashboard/"
echo "Recuerda activar GitHub Pages en Settings > Pages > Branch: main > Save."
read -p "Pulsa Enter para cerrar..."
