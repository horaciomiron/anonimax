# Librerías incluidas (versión 2)

Se guardan acá, dentro del repositorio, para que el sitio funcione sin depender de internet ni de un CDN.

| Archivo | Librería | Versión | Licencia | Para qué se usa |
|---|---|---|---|---|
| `jszip.min.js` | JSZip | 3.10.1 | MIT / GPLv3 | Abrir y volver a armar archivos .docx (que son ZIP) |
| `pdf.min.js` + `pdf.worker.min.js` | PDF.js (Mozilla) | 3.11.174 | Apache-2.0 | Leer el texto de un PDF y dibujar sus páginas |
| `pdf-lib.min.js` | pdf-lib | 1.17.1 | MIT | Crear el PDF anonimizado |

Se cargan solo cuando subís un .docx o un .pdf (carga diferida).
