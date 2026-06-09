#!/usr/bin/env python3
# Regenera standalone.html incrustando estilos.css y utils.js dentro de index.html.
# Patron correcto: f.read() + str.replace() + f.write(). Nunca bash echo.
import os

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)

with open(os.path.join(BASE, 'index.html'), encoding='utf-8') as f:
    html = f.read()

with open(os.path.join(ROOT, 'assets', 'css', 'estilos.css'), encoding='utf-8') as f:
    css = f.read()

with open(os.path.join(ROOT, 'assets', 'js', 'utils.js'), encoding='utf-8') as f:
    js = f.read()

link_tag = '<link rel="stylesheet" href="../assets/css/estilos.css">'
script_tag = '<script src="../assets/js/utils.js"></script>'

assert link_tag in html, 'No se encontro el link de estilos.css'
assert script_tag in html, 'No se encontro el script de utils.js'

html = html.replace(link_tag, '<style>\n' + css + '\n</style>')
html = html.replace(script_tag, '<script>\n' + js + '\n</script>')

with open(os.path.join(BASE, 'standalone.html'), 'w', encoding='utf-8') as f:
    f.write(html)

print('standalone.html regenerado:', len(html), 'caracteres')
