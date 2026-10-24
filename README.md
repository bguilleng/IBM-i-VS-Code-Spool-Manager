# IBM i - VS Code Spool Manager

**Versión:** 0.3.7 · **Entorno:** VS Code + IBM i 7.5 · **Integración:** Code for IBM i 3.0.13 (versión de referencia).

> **Estado:** proyecto en validación. Las operaciones de paginación FCFC, conversiones CCSID y eliminación necesitan pruebas en el IBM i de destino. No se garantiza reproducción exacta de informes impresos.

## Finalidad

Extensión de Visual Studio Code para gestionar archivos de spool del usuario conectado a IBM i sin entrar en una sesión 5250 para cada consulta. Permite listar, visualizar, descargar en local (TXT UTF-8 o PDF), exportar a la IFS (CCSID 37, 284 o 1208), seleccionar páginas cuando su paginación es verificable y eliminar spools previa confirmación.

## Requisitos y dependencias

| Componente | Requisito |
| --- | --- |
| Visual Studio Code | >= 1.90.0 (`engines.vscode`) |
| Code for IBM i | Extensión `halcyontechltd.code-for-ibmi`, conectada; versión de referencia 3.0.13 |
| IBM i | 7.5; acceso a `QSYS2.OUTPUT_QUEUE_ENTRIES_BASIC` |
| Node.js / npm | Instalación compatible con las dependencias del proyecto; comprobar `node --version` y `npm --version` |
| TypeScript | `^5.6.0` (desarrollo) |
| Tipos | `@types/node ^22`, `@types/vscode ^1.90` |
| Empaquetado | `@vscode/vsce ^3.2.0` |
| PDF | `pdf-lib ^1.17.1` (dependencia de ejecución) |

En IBM i se necesitan autorizaciones para consultar los spools y ejecutar las operaciones correspondientes, escritura en los directorios IFS de trabajo y destino, `CPYSPLF`, `iconv` en PASE y `CHGATR`. `DLTSPLF` requiere además un contexto de ejecución permitido por IBM i. La extensión reutiliza la conexión de Code for IBM i, sin configurar otra contraseña.

## Estructura del proyecto

```text
ibmi-spool-manager/
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE
├── resources/printer.svg
├── src/
│   ├── extension.ts       # Árbol y comandos VS Code
│   ├── service.ts         # SQL, CL, PASE, IFS
│   ├── core.ts            # Identificación y mandatos
│   ├── selection.ts       # Elemento seleccionado
│   ├── download.ts        # TXT y rangos de páginas
│   ├── pagination.ts      # Controles FCFC
│   └── pdf.ts             # PDF textual
└── test/
    ├── core.test.ts
    ├── selection.test.ts
    ├── download.test.ts
    └── pagination.test.ts
```

El punto de entrada compilado es `dist/src/extension.js`.

## Compilación, pruebas y empaquetado

En PowerShell, dentro de la carpeta que contiene `package.json`:

```powershell
cd 'C:\ruta\ibmi-spool-manager'
node --version
npm --version
npm install
npm run build
npm test
npm run package
```

- `npm run build`: ejecuta `tsc`.
- `npm test`: compila y ejecuta `node --test dist/test/*.test.js`.
- `npm run package`: compila y ejecuta `vsce package`.

Si termina correctamente, genera `ibmi-spool-manager-0.3.7.vsix`. No uses `vsce package --no-dependencies`: `pdf-lib` debe quedar incluida. Si npm informa vulnerabilidades, revisa `npm audit` antes de aplicar cambios forzados. Los scripts de instalación bloqueados deben revisarse individualmente.

## Instalación y actualización

1. Instala **Code for IBM i** y configura una conexión a IBM i.
2. Compila y empaqueta el proyecto.
3. En VS Code abre **Extensions → ... → Install from VSIX...** y selecciona el archivo generado.
4. Alternativamente, ejecuta:

   ```powershell
   code --install-extension '.\ibmi-spool-manager-0.3.7.vsix' --force
   ```

5. Ejecuta **Developer: Reload Window**.
6. Conéctate a IBM i mediante Code for IBM i.
7. Abre el icono lateral **IBM i Spools → My spools**.

Si actualizas una versión anterior, comprueba que VS Code muestre **0.3.7** en Extensions y pulsa **Refresh** para evitar trabajar con elementos antiguos.

## Configuración de codificación

En **Settings (JSON)**:

```json
{
  "ibmiSpool.sourceCcsid": 37
}
```

Este valor identifica el CCSID del texto **extraído por `CPYSPLF` antes de convertirlo**, no necesariamente el CCSID del spool original. Opciones: `37` (EBCDIC US), `284` (EBCDIC España), `1208` (UTF-8). Valor predeterminado: `37`.

**Ejemplo:** si se ha comprobado que el archivo temporal extraído está en CCSID 284, cambia la configuración a `284` antes de abrir o descargar el informe. Un CCSID de origen incorrecto puede producir caracteres corruptos.

## Uso de cada opción

### 1. Refresh — Actualizar lista

En **IBM i Spools → My spools**, pulsa el icono **Refresh** de la cabecera. La extensión vuelve a consultar `QSYS2.OUTPUT_QUEUE_ENTRIES_BASIC` para el usuario conectado.

**Ejemplo:** tras generar un `QPRINT`, pulsa Refresh para que aparezca en la lista.

### 2. Open spool — Abrir contenido

Haz clic en un spool del árbol o usa su menú contextual **Open spool**. El contenido textual se extrae a IFS, se convierte a UTF-8 y se abre en una pestaña de VS Code.

**Ejemplo:** selecciona `QPJOBLOG #2` y usa `Ctrl+F` para buscar `CPF` dentro del texto.

### 3. Download spool locally (TXT/PDF) — Descargar completo

Haz clic derecho sobre el spool → **Download spool locally (TXT/PDF)** → selecciona **TXT (UTF-8)** o **PDF (searchable text)** → elige carpeta y nombre en el diálogo de guardado.

**Ejemplos:**

```text
C:\Informes\QPJOBLOG-2.txt
C:\Informes\QPJOBLOG-2.pdf
```

La descarga **completa** no exige conocer los límites de página originales. El TXT se escribe en UTF-8. El PDF contiene texto seleccionable, pero puede repaginar el contenido y la fuente Courier estándar no representa todos los caracteres Unicode.

### 4. Download selected pages (TXT/PDF) — Descargar páginas

Haz clic derecho → **Download selected pages (TXT/PDF)** → selecciona TXT o PDF. La extensión comprueba primero si hay separadores de página (`\f`); si no, intenta una extracción adicional mediante `CPYSPLF ... CTLCHAR(*FCFC)` y analiza los controles de impresión. **Solo permite elegir páginas cuando el número reconstruido coincide con el total informado por IBM i.**

| Entrada | Páginas solicitadas |
| --- | --- |
| `2` | Página 2 |
| `1,3,6` | Páginas 1, 3 y 6 |
| `2-4` | Páginas 2, 3 y 4 |
| `1,3-5` | Páginas 1, 3, 4 y 5 |

**Ejemplo:** si el spool informa seis páginas y FCFC verifica seis, introduce `2,4-5` y guarda `QPJOBLOG-2-pages.txt`.

Si aparece `Cannot safely select original pages`, la paginación no pudo verificarse: utiliza **Download spool locally**. No se divide arbitrariamente por 66 líneas ni se inventan páginas.

### 5. Export to IFS — Copiar a IBM i

Haz clic derecho → **Export to IFS** → elige **UTF-8 (1208)**, **EBCDIC US (37)** o **EBCDIC Spain (284)** → introduce una ruta absoluta IFS para un **archivo nuevo**. La carpeta debe existir y permitir escritura.

**Ejemplos:**

```text
/home/GGUILLEN/reportes/QPJOBLOG-2-utf8.txt
/home/GGUILLEN/reportes/QPJOBLOG-2-ebcdic37.txt
/home/GGUILLEN/reportes/QPJOBLOG-2-ebcdic284.txt
```

La implementación copia el spool a un archivo temporal IFS, utiliza `iconv` para convertirlo y `CHGATR` para etiquetar el CCSID del archivo de destino. **Export to IFS guarda en IBM i**, no en Windows; para guardar en Windows utiliza **Download spool locally**.

### 6. Delete spool — Eliminar

Haz clic derecho → **Delete spool** → revisa la confirmación (nombre, número y trabajo) → confirma **Delete**. El servicio verifica de nuevo la identidad del spool y solicita su eliminación. La lista se refresca tras una operación satisfactoria.

**Ejemplo:** eliminar un spool de prueba `QPJOBLOG #2` del trabajo `879891/GGUILLEN/QPADEV000V`, únicamente si se tiene autorización y ya no se necesita. La eliminación es destructiva: evita probarla con spools de producción.

## Identificación exacta del spool

La extensión conserva `FILE_NUMBER` de SQL como `SPLNBR`, además de nombre y trabajo completo. No debe sustituirse automáticamente por `1` ni `*ONLY`.

**Ejemplo validado manualmente en IBM i 7.5:**

```cl
CPYSPLF FILE(QPJOBLOG) TOFILE(*TOSTMF) +
        JOB(879891/GGUILLEN/QPADEV000V) +
        SPLNBR(2) +
        TOSTMF('/tmp/ibmi-spool-test.txt') +
        STMFOPT(*REPLACE)
```

El formato de `JOB()` verificado en el sistema es **número/usuario/nombre**. El éxito de la prueba 5250 no demuestra por sí solo que todas las ejecuciones remotas de la extensión funcionen.

## Diagnóstico

Abre **View → Output → IBM i Spool Manager**. Para problemas de activación consulta **Developer: Show Logs... → Extension Host**.

| Mensaje | Comprobación recomendada |
| --- | --- |
| `There is no data provider registered` | Activación de la extensión, VSIX instalado, `dist/src/extension.js` |
| `command 'spool.refresh' not found` | Registro de comandos y errores de carga en Extension Host |
| `Not owned by connected user` | Usuario conectado y metadatos del spool; no desactivar validaciones |
| `Invalid IBM i identifier` | Valores vacíos o incorrectos del usuario, trabajo o spool |
| `CPD0078` / `CPD0074` | Comparar el `JOB()` enviado con el formato número/usuario/nombre |
| `CPF0001` en `CPYSPLF` | Revisar `FILE`, `JOB`, `SPLNBR`, permisos y ruta; probar en 5250 |
| `CPD000D` | Mandato no seguro en contexto multihilo; no hay reintento automático seguro |
| `SQL0443` / `CPF503E` | Revisar joblog del trabajo IBM i ejecutor |
| Caracteres incorrectos | Verificar CCSID efectivo de extracción y `ibmiSpool.sourceCcsid` |
| Páginas no verificables | Usar descarga completa; FCFC no sirve para todos los formatos |
| PDF con caracteres sustituidos | Limitación de Courier estándar en `pdf-lib` |

El canal de salida puede incluir `[SPOOL]`, `[GUARD OK]`, `[COPY SELECTED]`, `[PAGINATION]` y `[ile]`, útiles para comparar el spool seleccionado con el mandato enviado. Revisa los datos sensibles antes de compartir registros.

## Limitaciones conocidas

- La versión 0.3.7 no está certificada para todas las configuraciones de IBM i 7.5 y Code for IBM i 3.0.13.
- La reconstrucción FCFC requiere pruebas en el sistema real; no se implementan las APIs nativas `QSPOPNSP` / `QSPGETSP`.
- Los formatos AFPDS, IPDS y USERASCII pueden requerir otros mecanismos de extracción y representación.
- El PDF puede cambiar el número de páginas y sustituir caracteres no admitidos por la fuente estándar.
- `DLTSPLF` puede ser rechazado en un trabajo multihilo (`CPD000D`); no existe todavía un ejecutor independiente de un solo hilo.
- La comprobación del usuario desde `USER_NAME` no sustituye la autorización nativa ni prueba de forma independiente el propietario efectivo.
- La selección de páginas se rechaza si no se verifican sus límites; la descarga completa sigue disponible.

## Referencias

- [IBM — Copy Spooled File (CPYSPLF)](https://www.ibm.com/docs/en/i/7.5.0?topic=c-copy-spooled-file)
- [Code for IBM i — Extension API](https://codefori.github.io/docs/dev/api/)
- [Visual Studio Code — Extension API](https://code.visualstudio.com/api)

---

**Documentación elaborada a partir del código fuente v0.3.7 y de las pruebas manuales descritas durante el desarrollo.** Los ejemplos son ilustrativos y no implican validación integral del proyecto en producción.
