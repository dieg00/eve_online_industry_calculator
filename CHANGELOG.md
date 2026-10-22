# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Una sola versión para todo el proyecto (motor + web) — ver `## Versionado` en
`CLAUDE.md`. Nunca una sección `## [Unreleased]`: la web asume que la primera
entrada de este fichero es la versión que corre ahora mismo.

## [0.7.0] - 2026-10-22

### Added
- La pantalla de arranque enseña el progreso real: barra, megas recibidos de los esperados, velocidad, fichero que se está bajando, tiempo restante y cuánto tardó cada paso. Antes el paso «Runtime de Python» era un spinner fijo sin más información, que en una conexión lenta parecía colgado.
- Si la red deja de mandar datos 10 s, un aviso dice desde cuándo y qué fichero se espera, con un botón «Reintentar». El banner de error de arranque también tiene «Reintentar».

### Fixed
- Si la descarga del runtime de Python fallaba (bloqueador de contenido, CDN caído, red cortada), Pyodide se tragaba el error y la página se quedaba cargando para siempre. Ahora sale el error con la causa al momento.
- El paso «Preparar el motor» no llegaba a verse: la pestaña se bloqueaba compilando antes de pintarlo.
- Las visitas repetidas reutilizan los datos de la caché del navegador (blueprints, tipos, sistemas, rigs, ores) en vez de volver a bajarlos; precios e índices se siguen pidiendo frescos. La página tampoco descarga ya dos veces sistemas, rigs y ores.

## [0.6.1] - 2026-10-12

### Fixed
- La web vuelve a leer a diario los precios e índices de la rama `data`: `next.config.ts` toma la URL de `DATA_BRANCH_RAW_BASE` si falta `NEXT_PUBLIC_DATA_URL`, que nunca estuvo definida en Vercel. Hasta ahora se servían los precios empaquetados en el último deploy.

## [0.6.0] - 2026-10-09

### Added
- Atajos bajo el buscador de item: los últimos calculados en este navegador y unos ejemplos fijos (Providence, Damage Control II, Hulk, Rifter, Hobgoblin II, Fullerides).
- Botón «restablecer» junto a «copiar enlace» para volver al cálculo por defecto.

### Changed
- `web/README.md` documenta el mapa actual de `lib/` y `components/`; el `CLAUDE.md` de la raíz apunta a él.

## [0.5.0] - 2026-10-09

### Added
- Veredicto arriba del resultado: una frase («Fabricar Providence en Jita pierde 131 M ISK (−8,6 %). Sale más barato comprarlo hecho.»), con cuánto del coste sale de tu ore y las horas de minado, y dos barras coste (por origen) frente a ingreso neto.
- Arranque por pasos (runtime, motor, datos, compilar) con la nota de que la descarga solo ocurre la primera vez.

## [0.4.0] - 2026-10-09

### Added
- Selector de ore nuevo: las 16 familias de asteroide primero, cada una con los minerales que da; el ore de lunas, Triglavian y otros queda plegado. Presets por banda de seguridad como botones de estado y resumen de qué minerales cubre tu selección.
- Plan de minado: barra de m³ por ore, horas por ore con tu ritmo, y una tabla de lo que se compra en el mercado con el motivo (tus ores no lo dan / has elegido comprarlo).

## [0.3.0] - 2026-10-09

### Added
- Minar o comprar, mineral a mineral: en la lista de la compra cada mineral que tus ores producen sale como «minado» y se puede pasar a «lo compro» (parámetro `nomine` en la URL, `--buy-mineral` en la CLI); el margen y el plan de minado se recalculan.
- El motor devuelve `leaf_source` (minado / comprado) por cada material; la lista de la compra separa lo que sale de tu ore de lo que va al mercado y el multibuy copia solo lo que se compra.

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
