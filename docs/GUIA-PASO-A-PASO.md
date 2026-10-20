# Guía de mentoría: construí AnonimaX paso a paso

> **Regla de oro de tu consigna:** «no se acepta código que no puedan explicar». Esta guía no es para copiar y pegar: es para que **escribas cada archivo vos**, entiendas qué hace cada línea y puedas defenderlo. Abrí los archivos del proyecto como *modelo*, pero tipeá, rompé cosas a propósito y volvé a armarlas.

## Índice
0. Preparar el entorno
1. Entender qué vamos a construir (del Figma al código)
2. Etapa 1 — Estructurar con HTML semántico
3. Etapa 2 — Diseñar con CSS
4. Etapa 3 — Dar vida con JavaScript
5. Cómo funciona el motor de anonimización
6. Etapa 4 — Verificar usabilidad y accesibilidad
7. Etapa 5 — Publicar (Git, GitHub, GitHub Pages)
8. Estructura de carpetas
9. Formato de entrega
10. Preguntas que te pueden hacer (con respuestas)
11. Glosario

---

## 0. Preparar el entorno

1. **VS Code** (editor). Extensión recomendada: **Live Server** (recarga la página al guardar).
2. **Git**: instalalo y configurá tu identidad una vez:
   ```bash
   git config --global user.name "Tu Nombre"
   git config --global user.email "tu@correo.com"
   ```
3. **Cuenta de GitHub**.
4. **Chrome** (para DevTools y Lighthouse).
5. *(Opcional)* **Node.js** para correr `node tests/anonymizer.test.js`.

Creá la carpeta del proyecto y abrila en VS Code:
```bash
mkdir anonimax && cd anonimax
git init
```

---

## 1. Entender qué vamos a construir

Tu prototipo de Figma («JurisXAI») es una portada **oscura, institucional**: fondo azul marino `#080c18`, acento ámbar `#f5a623`, títulos con **DM Serif Display**, texto con **DM Sans** y etiquetas con **JetBrains Mono**. Tiene: barra de navegación, hero con panel de ejemplo, cifras, sección de capacidades, flujo de 4 pasos, CTA con formulario y footer.

Tomamos esa identidad y la aplicamos a un producto distinto: un **anonimizador de documentos** al estilo iLovePDF (eliges herramienta por tipo de archivo → subís → procesás → descargás).

### Pantallas (mínimo 3 pedidas, hacemos 4)

| Pantalla | Equivale en Figma a | Función |
|---|---|---|
| `index.html` | Portada completa | Inicio + formulario |
| `pages/herramientas.html` | Sección «Capacidades» | Elegir herramienta (listado) |
| `pages/anonimizar.html` | (nueva) | El formulario que hace el trabajo |
| `pages/privacidad.html` | Footer «Privacidad» | Transparencia y límites |

### User flow
`Inicio → Herramientas → (elijo CSV) → Anonimizar → Resultado → Descargar`
Cada función de JavaScript se justifica por un paso de este recorrido (lo vas a necesitar en la diapositiva 5).

### Decisión de diseño clave: ¿por qué todo en el navegador?
Un anonimizador que **sube** documentos a un servidor tiene un problema obvio: para proteger datos personales, primero los entregás a un tercero. Procesar en el navegador resuelve eso y además la consigna no pide backend. Es tu argumento principal de UX y de confianza.

### ¿Y los formatos PDF y DOCX?
Un PDF y un DOCX **no son texto plano**: hay que abrirlos con librerías (pdf.js, JSZip) y la consigna **prohíbe librerías**. Por eso soportamos TXT, CSV, JSON, XML, HTML y MD, y dejamos PDF/DOCX como «Próximamente» (copiando el texto y usando «Pegar texto» funciona). Es una limitación honesta y está documentada.

---

## 2. Etapa 1 — Estructurar (HTML semántico)

**Objetivo:** que el HTML tenga *significado*, no solo apariencia.

### 2.1 Esqueleto mínimo de toda página
```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AnonimaX — ...</title>
</head>
<body> ... </body>
</html>
```
- `lang="es"`: los lectores de pantalla eligen la pronunciación correcta.
- `viewport`: sin esto el celular dibuja la página como si fuera de escritorio.
- `<title>`: distinto en cada página (SEO y accesibilidad).

### 2.2 Etiquetas semánticas: qué va dónde

| Etiqueta | Uso en el proyecto |
|---|---|
| `<header>` | Cabecera con logo y menú |
| `<nav>` | Menú principal y menú del pie (cada uno con `aria-label`) |
| `<main>` | Contenido propio de la página (**uno solo**) |
| `<section>` | Bloques temáticos (hero, capacidades, flujo…), cada uno con un título |
| `<article>` | Contenido autónomo: cada tarjeta de «Qué detecta» |
| `<footer>` | Pie |
| `<figure>/<figcaption>` | La imagen del hero con su leyenda |
| `<ol>` | Los 4 pasos (el orden importa) |
| `<fieldset>/<legend>` | Agrupar opciones relacionadas del formulario |

> **Pregunta de defensa:** «¿por qué `<section>` y no `<div>`?» → porque `section` comunica un bloque temático al navegador, buscadores y lectores de pantalla; `div` no dice nada.

### 2.3 Jerarquía de títulos
Un solo `h1` por página, luego `h2` por sección, `h3` dentro de las secciones. **Nunca saltar** de h1 a h3. Si un título no te gusta visualmente, lo cambiás con CSS, no con otra etiqueta. Cuando una sección no necesita título visible (como las cifras) se usa la clase `.visually-hidden`.

### 2.4 Navegación
Mismo menú en las 4 páginas. Ojo con las **rutas relativas**: desde `pages/` hay que subir un nivel (`../index.html`, `../css/styles.css`). La página actual lleva `aria-current="page"` (el CSS la resalta y el lector de pantalla la anuncia).

### 2.5 Formularios accesibles (lo más importante)
```html
<label for="email">Correo electrónico</label>
<input type="email" id="email" name="email" aria-describedby="error-email" required>
<p class="error" id="error-email" role="alert"></p>
```
- `label for` = `id` del input: al hacer clic en el texto se enfoca el campo, y el lector lo anuncia.
- Tipos correctos: `email`, `number` (con `min`/`max`), `date`, `file`, `checkbox`, `radio`, `search`.
- `aria-describedby` conecta el campo con su mensaje de error.
- `role="alert"` hace que el lector de pantalla **lea el error** cuando aparece.
- `novalidate` en el `<form>`: desactiva los globitos del navegador para mostrar *nuestros* mensajes (más claros y consistentes).

### 2.6 Imágenes con `alt`
- Describí **qué comunica** la imagen, no «imagen de…». Ej.: el hero describe que el nombre, DNI y domicilio fueron reemplazados por etiquetas.
- Poné `width` y `height`: el navegador reserva el espacio y la página no «salta» al cargar.

### 2.7 Accesibilidad extra en HTML
- **Enlace «Saltar al contenido»** (`.skip-link`) al principio: quien navega con teclado evita recorrer todo el menú.
- Botón del menú: `aria-expanded` (abierto/cerrado) y `aria-controls` (qué menú controla).

✅ **Ejercicio:** abrí `index.html` sin el CSS (comentá el `<link>`). Si se lee ordenado y tiene sentido, tu HTML está bien.

---

## 3. Etapa 2 — Diseñar (CSS)

### 3.1 Variables en `:root`
```css
:root {
  --bg: #080c18;
  --accent: #f5a623;
  --font-display: 'DM Serif Display', Georgia, serif;
}
body { background-color: var(--bg); }
```
Ventaja enorme: el **modo claro** es solo redefinir variables:
```css
:root[data-theme='light'] { --bg: #f7f4ed; ... }
```
JavaScript cambia el atributo `data-theme` y *todo* el sitio cambia. Sin tocar más CSS.

### 3.2 Tipografías
Se cargan de Google Fonts en el `<head>`. La lista `Georgia, serif` es el **plan B** si no cargan.

### 3.3 Mobile first
Escribimos primero los estilos para celular, y agregamos con `@media (min-width: ...)` lo que cambia en pantallas grandes:
```css
.grid { grid-template-columns: 1fr; }                       /* celular: 1 columna */
@media (min-width: 48rem) { .grid { grid-template-columns: repeat(2, 1fr); } }   /* tablet */
@media (min-width: 64rem) { .grid { grid-template-columns: repeat(3, 1fr); } }   /* escritorio */
```
(`rem` = múltiplo del tamaño de letra base; 48rem ≈ 768 px.)

### 3.4 Flexbox vs Grid
- **Flexbox** → una dimensión (fila o columna): menú, botones, pie.
- **Grid** → dos dimensiones: grilla de tarjetas, hero en dos columnas, formulario en 2 columnas.
Regla práctica: «¿alineo cosas en una línea? Flex. ¿Armo una grilla? Grid».

### 3.5 Estados interactivos
- `:hover` (mouse), `:focus-visible` (teclado), `:active` (clic).
- Nunca hagas `outline: none` sin reemplazarlo: quien usa Tab quedaría «ciego».
```css
:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
```

### 3.6 Transiciones
```css
.btn { transition: background-color 180ms ease, transform 180ms ease; }
.btn:hover { transform: translateY(-2px); }
```
Y al final, respetamos a quienes tienen movimiento reducido en su sistema (`prefers-reduced-motion`).

### 3.7 Componentes reutilizables
Clases pensadas para repetirse: `.btn` (+ `--primary`, `--ghost`, `--sm`), `.card`, `.badge`, `.alert` (+ `--ok`, `--error`), `.field`. **Una sola definición, usada en todas las páginas** → consistencia.
La convención `bloque--modificador` se llama **BEM**.

### 3.8 Detalles del prototipo que replicamos
- Botones con **esquina cortada** (`clip-path: polygon(...)`).
- Grilla de fondo sutil (dos `linear-gradient`).
- Destello radial ámbar en el hero (`radial-gradient` en un `::before`).

### 3.9 Cuidado: `\b` no entiende tildes (esto es de JS, pero lo anoto acá)
Ver sección 5.

✅ **Ejercicio:** cambiá `--accent` a `#4cc9f0` y recargá. Todo el sitio cambia de color. Eso es lo que significa «sistema de diseño».

---

## 4. Etapa 3 — Dar vida (JavaScript)

La consigna pide **al menos 2**. Hicimos 6. Cada archivo con su responsabilidad:

| Archivo | Qué hace | Se carga en |
|---|---|---|
| `theme.js` | Aplica el tema guardado y marca `<html class="js">` | Todas, en el `<head>` sin `defer` |
| `main.js` | Menú, botón de tema, año del pie, validación del formulario de portada | Todas |
| `herramientas.js` | Tarjetas desde datos + búsqueda + filtro | Herramientas |
| `anonymizer.js` | Motor (no toca el DOM) | Anonimizar |
| `anonimizar-ui.js` | Conecta formulario ↔ motor | Anonimizar |

`defer` en un `<script>` = «ejecutalo cuando el HTML ya terminó de leerse».

### 4.1 Conceptos que usás (aprendelos en este orden)

**a) Seleccionar elementos**
```js
const boton = document.querySelector('#menu-toggle');   // por id
const chips = document.querySelectorAll('.chip');       // todos los que tengan la clase
```

**b) Eventos**
```js
boton.addEventListener('click', () => { ... });
```
Eventos usados: `click`, `input` (cada tecla), `blur` (al salir del campo), `submit`, `keydown`, `change`, `dragover`/`drop`.

**c) Modificar el DOM**
```js
menu.classList.toggle('is-open');          // agrega/quita una clase → el CSS hace el resto
boton.setAttribute('aria-expanded', 'true');
elemento.textContent = 'Hola';             // texto seguro
```
> **Nunca `innerHTML` con datos del usuario.** Si el archivo contiene `<script>`, `innerHTML` lo interpretaría (ataque XSS). `textContent` y `createTextNode` lo tratan siempre como texto. Por eso usamos `textContent` en todo el proyecto.

**d) Crear elementos desde datos (lo pide la consigna)**
En `herramientas.js` hay un array de objetos:
```js
const HERRAMIENTAS = [
  { id: 'csv', titulo: 'Planilla CSV', ext: '.CSV', categoria: 'datos', disponible: true, descripcion: '...' },
  ...
];
lista.replaceChildren(...HERRAMIENTAS.map(crearTarjeta));
```
`map` transforma cada objeto en una tarjeta; `filter` deja pasar solo las que coinciden con la búsqueda/categoría.

**e) Validación de formularios** (`main.js`)
Patrón: una función por campo que devuelve *un mensaje de error o texto vacío*:
```js
email: (campo) => !campo.value.trim() ? 'Ingresá tu correo.' : ''
```
- Se valida **al salir del campo** (`blur`) y **al enviar** (`submit`).
- `evento.preventDefault()` evita que la página se recargue.
- Si hay error, el foco va al **primer campo con error**.
- `aria-invalid="true"` marca el campo (el CSS le pone borde rojo y el lector lo anuncia).

**f) Menú hamburguesa**
Botón con `aria-expanded`; al hacer clic se alterna la clase `.is-open`. **Esc** cierra y devuelve el foco al botón. En el CSS, `.js .nav { display: none }` solo aplica si hay JavaScript (*mejora progresiva*: sin JS el menú queda visible).

**g) Modo claro/oscuro**
Cambia `data-theme` en `<html>` y guarda la preferencia en `localStorage`, siempre dentro de `try/catch` porque el navegador puede bloquearlo.

**h) Leer parámetros de la URL**
`herramientas.js` genera enlaces `anonimizar.html?tipo=csv`. En `anonimizar-ui.js`:
```js
new URLSearchParams(window.location.search).get('tipo');   // "csv"
```

**i) Leer archivos locales y descargar**
```js
const texto = await archivo.text();                         // lee el archivo (async/await)
const blob = new Blob([texto], { type: 'text/plain' });
const url = URL.createObjectURL(blob);                      // enlace temporal
```
Nada se sube a internet: todo queda en la memoria del navegador.

✅ **Ejercicio:** en `main.js` cambiá el mínimo de `volumen` a 10 y probá el mensaje. Después agregá una regla nueva: que el correo no pueda terminar en `@mailinator.com`.

---

## 5. Cómo funciona el motor de anonimización (`anonymizer.js`)

Es la parte más «de programación» y la que probablemente te pidan explicar.

### 5.1 Las 3 fases
1. **Detectar**: cada *detector* es una expresión regular que devuelve posiciones (inicio, fin) y un tipo.
2. **Resolver superposiciones**: si un CUIT `20-12345678-9` contiene algo que parece DNI, gana el de **menor número de prioridad**; a igualdad, el más largo.
3. **Reemplazar**: se arma el texto nuevo según el modo.

### 5.2 Expresiones regulares: lo básico
| Símbolo | Significa |
|---|---|
| `\d` | un dígito |
| `\d{8}` | exactamente 8 dígitos |
| `[A-Z]` | una letra mayúscula |
| `?` `*` `+` | 0 o 1 / 0 o más / 1 o más |
| `( )` | grupo de captura |
| `(?: )` | grupo que no captura |
| `\p{L}` / `\p{Lu}` | cualquier letra / letra mayúscula (Unicode) |
| `(?<!\d)` | «no precedido por un dígito» (lookbehind) |

Ejemplo del email: `/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/`
→ «caracteres válidos, una arroba, dominio con puntos, y una terminación de 2+ letras».

**Flags usados:** `g` (todas las coincidencias) · `u` (Unicode) · `d` (da las posiciones exactas de cada grupo) · `i` (ignora mayúsculas).

### 5.3 Trampas reales que resolvimos (muy buenas para contar en la defensa)
- **`\b` no entiende tildes**: «Ángel» o «ñ» rompen el límite de palabra. Usamos `(?<![\p{L}\d])`.
- **DNI vs dinero**: `12.345.678` puede ser un DNI o `$ 12.345.678,50`. Revisamos el contexto (símbolo `$` antes o `,00` después).
- **Tarjetas**: cualquier número largo no es una tarjeta. Pedimos formato 4-4-4-x y validamos con el **algoritmo de Luhn**. Un bug real que encontramos: un teléfono `+54 9 351 555-1234` (13 dígitos) pasaba Luhn por casualidad y se marcaba como tarjeta → restringimos el formato.
- **Nombres**: es lo más difícil sin IA. Usamos 4 estrategias (título delante, etiqueta tipo «Titular:», formato `APELLIDO, Nombre`, y nombre de pila de una lista + palabras con mayúscula) y una lista de excepciones («Santiago del Estero»).
- **Mismo valor, misma etiqueta**: un `Map` guarda `tipo|valor normalizado → número`. Así «Juan Pérez» es siempre `[NOMBRE_1]` y no se pierde la lectura del documento.
- **JSON válido**: si el DNI era un número sin comillas (`"dni": 123`), el reemplazo `[DNI_1]` rompería el JSON; lo envolvemos en comillas.

### 5.4 Detección por estructura
En CSV leemos el **encabezado** (`nombre,dni,email`) y ocultamos la columna completa; en JSON, por clave; en XML, por etiqueta. Es más preciso que adivinar con patrones. Tiene prioridad 0 (gana a todo).

### 5.5 Pruebas automáticas
```bash
node tests/anonymizer.test.js
```
Cada `prueba('descripción', () => assert...)` verifica un comportamiento. Si cambiás una regex y se rompe otra cosa, lo ves enseguida. Las pruebas incluyen un test que garantiza que **ningún dato sensible de los archivos de muestra queda en el resultado**.

### 5.6 Limitaciones (decilas vos antes de que te pregunten)
Reglas ≠ inteligencia. Puede no detectar un nombre sin ningún indicio, o un DNI sin puntos ni etiqueta en texto libre. Por eso el sitio avisa «Revisá siempre el resultado». Mejoras futuras: leer PDF/DOCX, OCR, listas de nombres más grandes, modo «solo revisar».

---

## 6. Etapa 4 — Verificar

### 6.1 Contraste
1. F12 → pestaña **Elements** → clic en un texto → en **Styles** hacé clic en el cuadradito de color → aparece la **relación de contraste** con ✓ o ✗.
2. Mínimos WCAG AA: **4,5:1** texto normal, **3:1** texto grande.
3. En este proyecto el texto atenuado `#a3adc8` sobre `#080c18` da más de 8:1. En modo claro usamos `#8a5100` para el ámbar-como-texto, porque el ámbar puro sobre blanco **no** alcanza el contraste.

### 6.2 Navegación con teclado
Recorré cada página **solo con Tab / Shift+Tab / Enter / Espacio / Esc**:
- [ ] El primer Tab muestra «Saltar al contenido»
- [ ] Se ve el foco en cada elemento
- [ ] El orden de tabulación es lógico
- [ ] El menú hamburguesa se abre con Enter y se cierra con Esc
- [ ] Los chips de filtro y el selector de archivo funcionan con teclado
- [ ] No quedás «atrapado» en ningún elemento

### 6.3 Lighthouse
Chrome → F12 → pestaña **Lighthouse** → marcar *Accessibility*, *Best practices*, *SEO* → **Analyze page load**. Hacelo en cada pantalla, **con el sitio publicado**, y anotá los puntajes (diapositiva 6 y README).
Resultados que obtuve probando este proyecto en un entorno de pruebas: Accesibilidad 100 y SEO 100 en las tres páginas medidas; Buenas prácticas 96, penalizada solo por una descarga de fuentes bloqueada en ese entorno. **Medí los tuyos**, pueden variar.

### 6.4 Las mejoras del testeo (Ejercitación 1.1)
Tomá las conclusiones de tu testeo de usabilidad y aplicá al menos una; documentala con *problema → cambio → justificación*. Ideas de mejoras que ya están implementadas, por si tu testeo detectó algo similar:
- Mensajes de error junto a cada campo.
- Aviso explícito de que el archivo no se sube.
- Mensaje claro cuando se intenta subir un PDF.
- Archivo de ejemplo descargable para probar.

### 6.5 Otras comprobaciones
- Probá en el modo dispositivo de DevTools (Ctrl+Shift+M) a 390 px de ancho: no debe haber scroll horizontal.
- Consola (F12 → Console) sin errores en rojo.
- Probá con zoom 200 %.

---

## 7. Etapa 5 — Publicar

### 7.1 Plan de commits (la consigna exige historial, no un único commit)
Hacé un commit **al terminar cada paso**. Una secuencia posible:

| # | Mensaje | Qué incluye |
|---|---|---|
| 1 | `chore: estructura inicial de carpetas y README` | carpetas vacías (con un archivo `.gitkeep`) + README base |
| 2 | `feat(html): estructura semántica de la portada` | `index.html` sin estilos |
| 3 | `feat(html): páginas herramientas, anonimizar y privacidad` | las otras 3 páginas |
| 4 | `style(css): variables, reset y tipografías` | secciones 1–3 del CSS |
| 5 | `style(css): componentes reutilizables (btn, card, badge, alert, campos)` | sección 4 |
| 6 | `style(css): cabecera, navegación y portada con Grid/Flexbox` | secciones 5–6 |
| 7 | `style(css): responsive y estados hover/focus` | media queries |
| 8 | `feat(js): menú hamburguesa y modo claro/oscuro` | `theme.js`, parte de `main.js` |
| 9 | `feat(js): validación del formulario de portada` | resto de `main.js` |
| 10 | `feat(js): listado de herramientas desde datos con búsqueda y filtro` | `herramientas.js` |
| 11 | `feat(js): motor de anonimización` | `anonymizer.js` |
| 12 | `test: pruebas automáticas del motor` | `tests/`, `muestras/` |
| 13 | `feat(js): interfaz del anonimizador` | `anonimizar-ui.js` |
| 14 | `fix(a11y): correcciones del testeo y de Lighthouse` | lo que corrijas |
| 15 | `docs: README con enlaces, Lighthouse y justificaciones` | README final |

Comandos de cada commit:
```bash
git add .
git commit -m "feat(html): estructura semántica de la portada"
```
Convención: `feat` (funcionalidad), `fix` (arreglo), `style` (CSS), `docs`, `test`, `chore`.

### 7.2 Subir a GitHub
1. En github.com → **New repository** → nombre `anonimax` → **Public** → sin README ni .gitignore (ya los tenés) → *Create*.
2. En tu carpeta:
   ```bash
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/anonimax.git
   git push -u origin main
   ```
   Si te pide contraseña, GitHub usa **Personal Access Token** (Settings → Developer settings → Tokens) o iniciá sesión con *GitHub Desktop* / el login del navegador de Git.
3. Los siguientes commits se suben con `git push`.

### 7.3 Publicar con GitHub Pages
1. Repositorio → **Settings** → **Pages**.
2. *Source*: **Deploy from a branch** → rama `main`, carpeta `/ (root)` → **Save**.
3. A los 1–2 minutos aparece `https://TU-USUARIO.github.io/anonimax/`.
4. Probá **cada enlace del menú** en el sitio publicado y abrí la consola.

Como todas las rutas son **relativas** (`css/styles.css`, `../index.html`), funciona igual en tu PC y en GitHub Pages. Con rutas absolutas (`/css/...`) fallaría porque el sitio vive en `/anonimax/`.

### 7.4 Problemas comunes
| Síntoma | Causa probable |
|---|---|
| Sitio sin estilos | Ruta del CSS mal escrita o mayúsculas/minúsculas distintas (GitHub distingue `Styles.css` de `styles.css`) |
| 404 en una página | Nombre de archivo distinto al del enlace |
| Cambios que no se ven | Falta `git push`, o el caché del navegador (Ctrl+F5) |
| Pages no aparece | Repositorio privado en plan gratuito, o rama equivocada |

---

## 8. Estructura de carpetas
```
anonimax/
├── index.html
├── pages/
│   ├── herramientas.html
│   ├── anonimizar.html
│   └── privacidad.html
├── css/styles.css
├── js/
│   ├── theme.js · main.js · herramientas.js
│   ├── anonymizer.js · anonimizar-ui.js
├── img/ logo.svg · hero-documento.svg
├── muestras/ ejemplo.txt · ejemplo.csv · ejemplo.json
├── tests/anonymizer.test.js
├── docs/
└── README.md
```
Coincide con la estructura sugerida por la consigna, con extras (`muestras`, `tests`, `docs`).

## 9. Formato de entrega
1. **Enlace al repositorio** de GitHub.
2. **Enlace al sitio publicado.**
3. **Presentación «Del diseño al código»**: ver `docs/PRESENTACION.md`.

## 10. Preguntas que te pueden hacer (y cómo responder)

1. **¿Por qué `<main>` una sola vez?** Representa el contenido principal único de la página; los lectores de pantalla permiten saltar directo a él.
2. **¿Diferencia entre `section` y `article`?** `article` se entiende por sí solo si lo sacás de la página (una tarjeta); `section` agrupa contenido temático dentro de la página.
3. **¿Para qué sirve `label for`?** Asocia el texto al campo: clic en el texto enfoca el input y el lector de pantalla lo anuncia.
4. **¿Por qué variables CSS?** Un único lugar para colores/tipografías; permite el modo claro redefiniendo variables.
5. **¿Qué es mobile first?** Escribir primero los estilos de celular y ampliar con `min-width`.
6. **¿Flexbox o Grid?** Flex para una dimensión, Grid para dos.
7. **¿Por qué `defer` en los scripts?** Para que se ejecuten con el HTML ya leído sin bloquear la carga.
8. **¿Por qué `theme.js` está en el `<head>` sin `defer`?** Para aplicar el tema antes de pintar y evitar el parpadeo.
9. **¿Qué hace `preventDefault()` en el submit?** Evita el envío/recarga por defecto para validar con JS.
10. **¿Por qué `textContent` y no `innerHTML`?** Evita inyección de HTML/scripts (XSS) desde contenido no confiable, como un archivo subido.
11. **¿Cómo sabés que no se sube el archivo?** Solo usamos `File.text()` en el navegador; no hay `fetch` ni formulario con `action`. Podés comprobarlo en DevTools → Network.
12. **¿Qué es el algoritmo de Luhn?** Un dígito verificador de las tarjetas: duplicar cada segundo dígito desde la derecha, sumar y comprobar que sea múltiplo de 10.
13. **¿Por qué falla `\b` con tildes?** En JS `\b` solo considera ASCII como «letra»; usamos lookarounds con `\p{L}`.
14. **¿Cómo resolvés dos detecciones superpuestas?** Prioridad numérica y, a igualdad, la más larga.
15. **¿Qué mejorarías?** PDF/DOCX con lectura de archivos, OCR, listas de nombres más completas, vista de revisión donde el usuario acepte o rechace cada dato.

## 11. Glosario
- **DOM**: representación del HTML como árbol de objetos que JS puede modificar.
- **Semántica**: etiquetas que describen el *significado* del contenido.
- **ARIA**: atributos que dan información extra a tecnologías asistivas.
- **Responsive**: diseño que se adapta a cualquier tamaño de pantalla.
- **Mejora progresiva**: la base funciona sin JS; JS agrega mejoras.
- **Regex**: expresión regular, patrón para buscar texto.
- **Blob**: objeto que representa datos binarios/archivo en memoria.
- **XSS**: ataque que inyecta scripts a través de contenido no confiable.
- **Commit**: «foto» guardada de tu proyecto en Git.

---
### Aviso de uso responsable
AnonimaX es una ayuda, no una garantía legal. Antes de compartir cualquier documento anonimizado, **revisalo completo**. Los datos de los archivos de muestra son inventados.
