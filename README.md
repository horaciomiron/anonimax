# AnonimaX — Anonimizador de documentos

Aplicación web que **oculta datos personales** (nombres, DNI, CUIT/CUIL, domicilios, cuentas bancarias, tarjetas, correos, teléfonos, patentes y fechas) en documentos **TXT, CSV, JSON, XML, HTML y Markdown**. Todo se procesa en el navegador: **ningún archivo se sube a un servidor**.

> Proyecto de la Ejercitación 3.1 «Del diseño al código» — HTML, CSS y JavaScript sin frameworks ni librerías.

## Integrantes

- _Completar: Nombre y Apellido_

## Enlaces

- 🌐 Sitio publicado: https://horaciomiron.github.io/anonimax/
- 🎨 Prototipo de Figma: https://www.figma.com/make/Wgc7l3TwJf04ijG8DCSI1z/AI-Legal-Document-Analyzer?t=T0AWejI6W2Yxdhb5-1
- 📦 Repositorio: https://github.com/horaciomiron/anonimax

## Pantallas

| Pantalla | Archivo | Qué resuelve |
|---|---|---|
| Inicio | `index.html` | Presenta el problema y la solución; formulario de contacto con validación |
| Herramientas | `pages/herramientas.html` | Listado generado desde datos, con búsqueda y filtros (estilo iLovePDF) |
| Anonimizar | `pages/anonimizar.html` | Formulario de 3 pasos + resultado comparado |
| Privacidad | `pages/privacidad.html` | Cómo se tratan los datos y límites de la herramienta |

## Funcionalidades de JavaScript

1. Menú hamburguesa accesible (`aria-expanded`, tecla Esc)
2. Modo claro / oscuro con variables CSS (se recuerda la elección)
3. Validación de formularios con mensajes junto a cada campo
4. Contenido generado desde un array de objetos (tarjetas de herramientas)
5. Búsqueda y filtro por categoría
6. Motor de anonimización (`js/anonymizer.js`) con pruebas automáticas

## Estructura

```
anonimax/
├── index.html
├── pages/            herramientas.html · anonimizar.html · privacidad.html
├── css/styles.css
├── js/               theme.js · main.js · herramientas.js · anonimizar-ui.js · anonymizer.js
├── img/              logo.svg · hero-documento.svg
├── muestras/         archivos de prueba (datos inventados)
├── tests/            anonymizer.test.js
└── docs/             guía, checklist y esquema de presentación
```

## Cómo ejecutarlo

Abrí `index.html` con doble clic, o usá la extensión **Live Server** de VS Code.
Pruebas del motor: `node tests/anonymizer.test.js` (requiere Node.js).

## Cambios respecto al prototipo de Figma (y por qué)

| Cambio | Justificación (UX) |
|---|---|
| Se reemplaza «JurisXAI» por **AnonimaX** y el contenido se adapta a anonimización | El prototipo era una portada de otro producto; se reutiliza su identidad visual |
| Se agrega **modo claro** | Mejora la legibilidad en ambientes luminosos y para personas con baja visión |
| Se agrega página **Herramientas** | Permite elegir por tipo de archivo, como en iLovePDF |
| Aviso «Revisá siempre el resultado» | La detección automática no es infalible; evita falsa sensación de seguridad |
| Menú hamburguesa en celular | El menú horizontal no entra en pantallas chicas |

## Verificación

| Página | Accesibilidad | Buenas prácticas | SEO |
|---|---|---|---|
| Inicio | 100 | _completar_ | 100 |
| Herramientas | 100 | _completar_ | 100 |
| Anonimizar | 100 | _completar_ | 100 |

_Lighthouse en Chrome → DevTools → Lighthouse. Volvé a medir vos y anotá tus propios valores._

## Limitaciones

- No lee PDF ni DOCX (requeriría librerías externas, que la consigna no permite).
- La detección usa reglas, no IA: puede omitir o ocultar de más. **Revisar siempre el resultado.**
- Un DNI sin puntos y sin la palabra «DNI» delante no se detecta fuera de CSV/JSON/XML.
