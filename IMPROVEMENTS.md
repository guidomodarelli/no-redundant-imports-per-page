Sí, hay margen para mejorar rendimiento. El plugin ya tiene una optimización importante, que es cachear el análisis completo por `cwd + options` en [cache.ts](/Users/gmodarelli/ghq/projects/no-redundant-imports-per-page/src/core/cache.ts#L5), pero todavía hay varios costos evitables.

Lo más importante hoy es esto: cada vez que la regla necesita diagnósticos para un archivo, dispara `analyzeWorkspace(...)` y ese análisis recorre todos los entry points descubiertos del repo, no solo el árbol relevante para ese archivo, en [analyzer.ts](/Users/gmodarelli/ghq/projects/no-redundant-imports-per-page/src/core/analyzer.ts#L178). En CLI eso se amortiza bastante por el cache, pero en editor o ejecuciones parciales puede sentirse pesado. La mejora con más impacto sería una de estas dos:
- análisis incremental por archivo objetivo, resolviendo solo los entry points que pueden alcanzarlo;
- o precalcular un índice inverso `stylesheet -> entry points` y analizar solo esos subárboles.

Después, hay mejoras más puntuales y bastante concretas:

- El parser usa `postcss-scss.parse(...)` para todo el archivo aunque solo consume `@import` top-level, en [parser.ts](/Users/gmodarelli/ghq/projects/no-redundant-imports-per-page/src/core/parser.ts#L155). Si querés máximo rendimiento, podrías reemplazarlo por un scanner más liviano orientado solo a `@import`, con el costo de tener más complejidad y más riesgo de edge cases.
- La resolución de archivos prueba muchos candidatos con `existsSync` + `statSync` para cada import, en [resolver.ts](/Users/gmodarelli/ghq/projects/no-redundant-imports-per-page/src/core/resolver.ts#L75). Funciona bien, pero en repos grandes puede pegar. Ahí se puede mejorar cacheando también los “candidate resolutions” negativos y positivos por `targetPath`.

Si tuviera que priorizar por retorno real, haría esto:
1. evitar reanalizar workspace completo cuando solo cambia un archivo;
2. optimizar la resolución de imports;
3. recién después evaluar reemplazar PostCSS por un parser más chico.
