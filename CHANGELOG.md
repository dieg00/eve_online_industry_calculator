# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Una sola versión para todo el proyecto (motor + web) — ver `## Versionado` en
`CLAUDE.md`. Nunca una sección `## [Unreleased]`: la web asume que la primera
entrada de este fichero es la versión que corre ahora mismo.

## [0.2.0] - 2026-09-11

### Added
- Versionado del proyecto: fuente única en `pyproject.toml`, `eveindustry.__version__` calculada desde los metadatos instalados, y este `CHANGELOG.md` como historial.
- Insignia de versión discreta en la web, junto a la antigüedad de los datos, que abre un panel plegable con las novedades de cada versión. Marca sutil si hay una versión no vista por ese navegador; nunca en la primera visita.

### Fixed
- El nombre del wheel del motor ya no está hardcodeado en tres sitios (`sync-assets.mjs` y dos veces en `pyodide.ts`); se publica un `manifest.json` con el nombre real y el hash de cache-busting.

## [0.1.0] - 2026-09-11

### Added
- Motor de cálculo make-or-buy: resuelve el árbol de fabricación completo con punto fijo, invención (ranking de decryptors), rigs de ME, seguridad e índices de coste por sistema.
- Modo de minado propio: plan de minado, cobertura mineral a mineral, margen por hora y por m³.
- Interfaz web (Next.js + Pyodide): calculadora completa en el navegador, sin backend — item, ME, sistema, estructura, rigs, mercado, invención, overrides por nodo, lista de la compra, árbol de decisiones y antigüedad de los datos.
- Publicación diaria de precios e índices de coste vía GitHub Action a una rama de datos independiente.
