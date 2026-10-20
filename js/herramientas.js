/* herramientas.js — listado de herramientas generado desde DATOS
   Idea clave: en vez de escribir 9 tarjetas a mano en el HTML, guardamos la
   información en un ARRAY DE OBJETOS y creamos las tarjetas con el DOM.
   Si mañana agregás una herramienta, solo sumás un objeto al array. */
(() => {
  'use strict';

  const HERRAMIENTAS = [
    { id: 'texto', titulo: 'Texto pegado', ext: 'TXT', categoria: 'texto', disponible: true,
      descripcion: 'Pegá el contenido de cualquier documento y anonimizalo al instante.' },
    { id: 'txt', titulo: 'Archivo de texto', ext: '.TXT', categoria: 'texto', disponible: true,
      descripcion: 'Contratos, actas y notas en texto plano. Detecta datos por patrones.' },
    { id: 'md', titulo: 'Markdown', ext: '.MD', categoria: 'texto', disponible: true,
      descripcion: 'Documentación y apuntes escritos en Markdown.' },
    { id: 'csv', titulo: 'Planilla CSV', ext: '.CSV', categoria: 'datos', disponible: true,
      descripcion: 'Lee los encabezados y oculta columnas completas: nombre, DNI, email, CBU…' },
    { id: 'json', titulo: 'Datos JSON', ext: '.JSON', categoria: 'datos', disponible: true,
      descripcion: 'Oculta valores por clave y el resultado sigue siendo un JSON válido.' },
    { id: 'xml', titulo: 'Documento XML', ext: '.XML', categoria: 'datos', disponible: true,
      descripcion: 'Anonimiza el contenido de etiquetas como <dni> o <email>.' },
    { id: 'html', titulo: 'Página HTML', ext: '.HTML', categoria: 'web', disponible: true,
      descripcion: 'Páginas guardadas o plantillas de correo con datos personales dentro.' },
    { id: 'pdf', titulo: 'Documento PDF', ext: '.PDF', categoria: 'proximamente', disponible: false,
      descripcion: 'Requiere leer el interior del PDF. Mientras tanto, copiá el texto y usá «Texto pegado».' },
    { id: 'docx', titulo: 'Documento Word', ext: '.DOCX', categoria: 'proximamente', disponible: false,
      descripcion: 'Requiere abrir el archivo .docx (un ZIP con XML). Planificado para una próxima versión.' },
  ];

  const lista = document.querySelector('#lista-herramientas');
  const contador = document.querySelector('#contador');
  const vacio = document.querySelector('#sin-resultados');
  const buscador = document.querySelector('#buscar');
  const chips = document.querySelectorAll('.chip');
  const formBusqueda = document.querySelector('#form-busqueda');

  let categoria = 'todas';
  let consulta = '';

  // Quita tildes y pasa a minúsculas: "Planilla" y "planílla" se buscan igual
  const normalizar = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

  // Crea un elemento con texto y clases (evita repetir createElement)
  function el(tag, clase, texto) {
    const nodo = document.createElement(tag);
    if (clase) nodo.className = clase;
    if (texto) nodo.textContent = texto;   // textContent (no innerHTML): así nunca se interpreta HTML
    return nodo;
  }

  function crearTarjeta(h) {
    const li = el('li');
    const article = el('article', `card tool${h.disponible ? '' : ' tool--soon'}`);

    const top = el('div', 'tool__top');
    top.append(el('span', 'badge badge--accent', h.ext));
    if (!h.disponible) top.append(el('span', 'badge badge--muted', 'Próximamente'));

    const titulo = el('h3', 'card__title', h.titulo);
    const desc = el('p', '', h.descripcion);

    let accion;
    if (h.disponible) {
      accion = el('a', 'btn btn--primary btn--sm', 'Usar herramienta →');
      accion.href = `anonimizar.html?tipo=${h.id}`;     // el anonimizador lee este parámetro
      accion.setAttribute('aria-label', `Usar herramienta: ${h.titulo}`);
    } else {
      accion = el('span', 'btn btn--ghost btn--sm', 'No disponible aún');
      accion.setAttribute('aria-disabled', 'true');
    }

    article.append(top, titulo, desc, accion);
    li.append(article);
    return li;
  }

  function mostrar() {
    const q = normalizar(consulta.trim());
    const filtradas = HERRAMIENTAS.filter((h) => {
      const coincideCategoria = categoria === 'todas' || h.categoria === categoria;
      const texto = normalizar(`${h.titulo} ${h.ext} ${h.descripcion} ${h.categoria}`);
      return coincideCategoria && texto.includes(q);
    });

    lista.replaceChildren(...filtradas.map(crearTarjeta));
    vacio.hidden = filtradas.length > 0;
    contador.textContent = `${filtradas.length} ${filtradas.length === 1 ? 'herramienta' : 'herramientas'}`;
  }

  buscador.addEventListener('input', () => { consulta = buscador.value; mostrar(); });
  formBusqueda.addEventListener('submit', (e) => e.preventDefault());   // Enter no recarga la página

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      categoria = chip.dataset.categoria;
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      mostrar();
    });
  });

  mostrar();
})();
