# Iconos para Expo

Los archivos SVG (`icon.svg`, `favicon.svg`) son la fuente de verdad de la marca. Expo necesita versiones PNG para builds nativas:

| Archivo requerido | Tamaño | Notas |
|-------------------|--------|-------|
| `icon.png`         | 1024×1024 | Icono base de la app |
| `splash.png`       | 1242×2436 | Splash screen — centrar el símbolo sobre `#0A0E1A` |
| `adaptive-icon.png`| 1024×1024 | Foreground para Android adaptive icon |
| `favicon.png`      | 48×48     | Para builds web de Expo |

Genera los PNG con cualquiera de:

```bash
# Opción A — Inkscape (CLI)
inkscape icon.svg --export-type=png --export-width=1024 --export-filename=icon.png

# Opción B — rsvg-convert
rsvg-convert -w 1024 -h 1024 icon.svg -o icon.png

# Opción C — usar https://realfavicongenerator.net/ con favicon.svg
```

Mientras no existan, el dev server de Expo correrá usando defaults y emitirá un warning.
