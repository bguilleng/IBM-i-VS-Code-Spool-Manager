# IBM i Spool Manager v0.3.5

## Corrección de selección del spool

- La columna SQL `FILE_NUMBER` se conserva íntegra y se valida como entero positivo; nunca se sustituye por `1` ni por `*ONLY`.
- El mandato utiliza el formato comprobado en IBM i 7.5: `JOB(879891/GGUILLEN/QPADEV000V) SPLNBR(2)`.
- El canal Output > IBM i Spool Manager muestra `[SPOOL]`, `[GUARD OK]`, `[COPY SELECTED]` y el mandato `[ile]` para comparar número listado y número ejecutado.
- Se agregaron pruebas de regresión para `FILE_NUMBER=2` y datos faltantes.

## Instalación

```powershell
npm install
npm test
npm run package
code --install-extension .\ibmi-spool-manager-0.3.5.vsix --force
```

Ejecuta `Developer: Reload Window` y pulsa Refresh en la vista para evitar elementos anteriores.

## Límites

La copia a IFS se comprobó manualmente desde 5250, pero no se ha validado el ejecutor remoto de Code for IBM i 3.0.13 ni la conversión de CCSID. Esta versión no resuelve por sí sola errores CPD000D/SQL0443 ni garantiza paginación PDF. No pruebes borrado con spools importantes.

# IBM i Spool Manager v0.3.1

Fixes the blank IBM i identifier failure by reading the connected profile from Code for IBM i connection configuration and cross-checking SESSION_USER when available. Handles SQL column casing, qualified aliases and one-column result rows. Keeps per-spool access checks.

## Install

```powershell
npm install
npm test
npm run package
code --install-extension .\ibmi-spool-manager-0.3.1.vsix --force
```

Then run **Developer: Reload Window**. Use **Output → IBM i Spool Manager** for diagnostics.

## Known limitations

- Code for IBM i 3.0.13 compatibility and the IBM i 7.5 CPYSPLF/iconv/CHGATR workflow require verification on your IBM i system.
- `USER_NAME` from OUTPUT_QUEUE_ENTRIES_BASIC is used to scope spool access; verify owner semantics and authority before relying on it as a security boundary.
- Page selection relies on form-feed characters retained by the extraction; PDF generation uses standard Courier with limited Unicode support.
- `ibmiSpool.sourceCcsid` must match the actual stream-file encoding.

# IBM i Spool Manager v0.3.0

Extensión de VS Code para listar spools del usuario de sesión conectado mediante Code for IBM i, ver contenido, eliminar, exportar a IFS en CCSID 37/284/1208 y descargar TXT/PDF o páginas seleccionadas.

## Instalación

```powershell
npm install
npm test
npm run package
code --install-extension .\ibmi-spool-manager-0.3.0.vsix --force
```

Reinicia VS Code y conéctate a IBM i con Code for IBM i 3.0.13. La extensión aparece en el panel lateral IBM i Spools.

## Codificación

`CPYSPLF TOFILE(*TOSTMF) WSCST(*NONE)` escribe el contenido del spool a un archivo IFS temporal. Se utiliza `iconv` en PASE para convertir al CCSID elegido y `CHGATR` para etiquetar el archivo resultante. **Debes configurar `ibmiSpool.sourceCcsid`** según el CCSID efectivo del texto extraído (valor predeterminado 37). Una selección incorrecta produce caracteres corruptos; no se detecta automáticamente el CCSID de cada spool.

## Limitaciones

- Probado estáticamente con TypeScript y pruebas unitarias; **no probado contra IBM i real ni Code for IBM i 3.0.13 en este entorno**.
- Los spools AFPDS, IPDS y otros formatos no textuales pueden requerir una conversión distinta; no se garantiza que `WSCST(*NONE)` produzca texto legible.
- La selección de páginas se basa en caracteres `\f` presentes en el texto extraído. Si no se conservan, **no representa las páginas originales**. No usar esta opción para paginación fiable hasta implementar extracción de controles de impresión.
- PDF usa Courier estándar y sustituye caracteres no admitidos; para Unicode completo se necesita incrustar una fuente compatible.
- `USER_NAME` es el usuario reportado por la vista SQL, no una prueba independiente del propietario real del objeto spool. IBM i aplica autorizaciones adicionales.
- El proceso de conversión requiere `iconv` en PASE y autorización sobre los directorios IFS.
- Las rutas IFS deben existir y no contener caracteres prohibidos por el validador.

## Diagnóstico

Consulta Output > IBM i Spool Manager y Log (Extension Host). Para errores de conversión verifica el CCSID de origen y que `iconv` exista en PASE.

## Referencias IBM

- CPYSPLF: https://www.ibm.com/docs/en/i/7.5.0?topic=c-copy-spooled-file
- CPYTOSTMF: https://www.ibm.com/docs/en/i/7.5.0?topic=c-copy-stream-file

## v0.3.2 — Corrección de comandos del menú contextual

Los comandos `spool.download`, `spool.downloadPages`, `spool.export` y `spool.remove` ahora aceptan tanto el objeto `Spool` (apertura por doble clic) como el `TreeItem` del menú contextual (propiedad `spool`). Se incorpora `src/selection.ts` y pruebas unitarias de ambos casos. Se corrige el orden del parámetro CL `JOB(nombre/usuario/número)`.

La selección de páginas individuales se rechaza si el spool indica varias páginas y la extracción no contiene separadores de página; no se inventa paginación.

**Pendiente de verificación real:** `CPYSPLF`, `iconv`/CCSID y descarga IFS contra IBM i 7.5 con Code for IBM i 3.0.13. El PDF usa fuentes estándar y no representa todo Unicode.


## v0.3.3 — validación de JOB()

Se confirma que `QSYS2.OUTPUT_QUEUE_ENTRIES_BASIC.JOB_NAME` utiliza
`numero/usuario/nombre`, mientras que `CPYSPLF JOB()` y `DLTSPLF JOB()`
requieren `nombre/usuario/numero`. La generación del mandato está centralizada
en `src/core.ts` y se han añadido pruebas de regresión con
`684728/GGUILLEN/QPADEV000G`.

La versión anterior del fuente ya contenía la inversión de componentes; si
la instalación sigue enviando `JOB(684728/...)`, comprobar que el VSIX instalado
se corresponde con el código recién compilado.


## v0.3.4: Diagnóstico del mandato real

Esta versión registra el mandato CL/PASE exacto en **Output → IBM i Spool Manager** antes de ejecutarlo. Si vuelve a aparecer CPD0078/CPD0074, copie el mandato registrado: las pruebas de generación comprueban el orden `JOB(QPADEV000V/GGUILLEN/879891)`; un error que mencione el orden contrario puede indicar una instalación anterior o un mandato diferente ejecutado por la API.

`CPD000D` (mandato no seguro en trabajo multihilo) se comunica de forma explícita; **no se realiza un reintento automático ni se eluden restricciones del sistema**. Para eliminar spools en esos entornos se requiere un ejecutor seguro en un trabajo IBM i de un solo hilo, que no está implementado en esta versión.

Esta versión **no se ha probado en IBM i 7.5 real**. Los mensajes `SQL0443` y `CPF503E` requieren revisar el joblog del trabajo que los produce.


## v0.3.6 — Full downloads versus selected pages

- **Download spool locally** always permits a complete TXT UTF-8 or text-based PDF export without requiring form-feed page separators. The PDF can repaginate the source text.
- **Download selected pages** only permits selection if form-feed-separated text segments exactly match the page count reported by IBM i; otherwise it explains the limitation and does not guess page breaks.
- The log records the reported and detected page counts when they differ.
- This release does not implement IBM i native per-page extraction.


## v0.3.7: selección de páginas mediante FCFC

Cuando el texto normal no contiene separadores de página, **Download selected pages** intenta una segunda extracción con `CPYSPLF ... CTLCHAR(*FCFC)`, convierte el resultado a UTF-8, interpreta el primer carácter de control de cada registro y exige que el número de páginas reconstruidas coincida con `TOTAL_PAGES`. Si el spool no es de texto de líneas compatible, hay controles no representables, o el conteo no coincide, la selección se rechaza. No se inventan páginas a partir de líneas fijas. La descarga completa sigue disponible.

Para formatos avanzados (AFPDS/IPDS/USERASCII) la reconstrucción fiable requiere una implementación adicional con APIs nativas como QSPOPNSP/QSPGETSP, o conversión específica por formato. **Esta versión no implementa esas APIs**. La extracción FCFC debe validarse en un IBM i real.

Comando de prueba 5250: `CPYSPLF FILE(QPJOBLOG) TOFILE(*TOSTMF) JOB(879891/GGUILLEN/QPADEV000V) SPLNBR(2) TOSTMF('/tmp/spool-fcfc.txt') CTLCHAR(*FCFC) STMFOPT(*REPLACE)`
