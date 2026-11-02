/* =====================================================================
   docx-handler.js — Anonimiza archivos Word (.docx) conservando el formato
   ---------------------------------------------------------------------
   Un .docx es un ZIP con archivos XML adentro. El texto vive en etiquetas
   <w:t> agrupadas en "runs" (<w:r>) dentro de párrafos (<w:p>).

   Problema real: Word suele PARTIR una palabra en varios runs
   ("Ju" + "an Pé" + "rez"). Si buscáramos en cada <w:t> por separado no
   encontraríamos nada. Por eso:
     1. juntamos el texto de TODO el párrafo,
     2. corremos el motor sobre ese texto completo,
     3. devolvemos el resultado a los <w:t> originales (así se conserva el
        formato: negritas, fuentes, colores).

   También limpiamos lugares donde los datos suelen quedar escondidos:
   encabezados, pies, notas, comentarios, cambios con control de cambios,
   nombres de autores, metadatos y la miniatura del documento.

   Requiere: JSZip y Anonimax (anonymizer.js).
   ===================================================================== */

const DocxAnonimizador = (() => {
  'use strict';

  const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const NS_XML = 'http://www.w3.org/XML/1998/namespace';
  // Partes del documento que contienen texto visible
  const PARTE_TEXTO = /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/;

  /* ---------- Recolectar los elementos de texto de UN párrafo ---------- */
  // Devuelve una lista ordenada: textos editables (<w:t>, <w:delText>) y
  // separadores (tab, salto de línea) que cuentan para el texto pero no se tocan.
  function recolectar(parrafo) {
    const items = [];
    (function recorrer(nodo) {
      for (const hijo of nodo.childNodes) {
        if (hijo.nodeType !== 1) continue;
        if (hijo.namespaceURI === NS_W) {
          const nombre = hijo.localName;
          if (nombre === 'p') continue;                        // párrafo anidado (cuadro de texto): se procesa aparte
          if (nombre === 'instrText') continue;                // códigos de campo, no es texto visible
          if (nombre === 't' || nombre === 'delText') { items.push({ nodo: hijo, texto: hijo.textContent }); continue; }
          if (nombre === 'tab') { items.push({ sep: '\t' }); continue; }
          if (nombre === 'br' || nombre === 'cr') { items.push({ sep: '\n' }); continue; }
        }
        recorrer(hijo);
      }
    })(parrafo);
    return items;
  }

  const textoDe = (items) => items.map((it) => (it.sep !== undefined ? it.sep : it.texto)).join('');

  /* ---------- Devolver el resultado a los <w:t> ---------- */
  function aplicar(items, texto, hallazgos) {
    // dueño[i] = a qué item pertenece el carácter i del texto completo
    const dueno = [];
    items.forEach((it, n) => {
      const largo = it.sep !== undefined ? it.sep.length : it.texto.length;
      for (let k = 0; k < largo; k++) dueno.push(n);
    });

    const nuevo = items.map((it) => (it.sep !== undefined ? null : []));
    const yaPuesto = new Set();
    let h = 0;
    for (let i = 0; i < texto.length; i++) {
      while (h < hallazgos.length && i >= hallazgos[h].fin) h++;
      const n = dueno[i];
      if (items[n].sep !== undefined) continue;                // tabs y saltos quedan como están
      const dentro = h < hallazgos.length && i >= hallazgos[h].inicio && i < hallazgos[h].fin;
      if (!dentro) nuevo[n].push(texto[i]);
      else if (!yaPuesto.has(h)) { nuevo[n].push(hallazgos[h].reemplazo); yaPuesto.add(h); }
    }

    items.forEach((it, n) => {
      if (!nuevo[n]) return;
      it.nodo.textContent = nuevo[n].join('');
      it.nodo.setAttributeNS(NS_XML, 'xml:space', 'preserve'); // que Word no se coma los espacios
    });
  }

  /* ---------- Tablas: usar los encabezados como pista ---------- */
  // Si una columna se llama «DNI» o una fila empieza con «Titular», todo el
  // contenido de esa celda es ese tipo de dato, aunque no tenga formato reconocible.
  function pistasDeTablas(doc) {
    const pistas = new Map();                                  // párrafo -> tipo
    const hijosCelda = (fila) => [...fila.childNodes].filter((n) => n.nodeType === 1 && n.localName === 'tc');
    const parrafosCelda = (celda) => [...celda.childNodes].filter((n) => n.nodeType === 1 && n.localName === 'p');
    const textoCelda = (celda) => parrafosCelda(celda).map((p) => textoDe(recolectar(p))).join(' ').trim();
    const limpiar = (t) => t.replace(/[:.]+\s*$/, '');

    for (const tabla of doc.getElementsByTagNameNS(NS_W, 'tbl')) {
      const filas = [...tabla.childNodes].filter((n) => n.nodeType === 1 && n.localName === 'tr');
      if (!filas.length) continue;
      const celdas = filas.map(hijosCelda);
      const cabecera = celdas[0].map((c) => Anonimax.tipoPorClave(limpiar(textoCelda(c))));
      const cuantas = cabecera.filter(Boolean).length;
      const esDeColumnas = filas.length > 1 && ((celdas[0].length >= 3 && cuantas >= 1) || cuantas >= 2);

      celdas.forEach((fila, r) => {
        fila.forEach((celda, c) => {
          let tipo = null;
          if (esDeColumnas) { if (r > 0) tipo = cabecera[c]; }
          else if (c > 0) tipo = Anonimax.tipoPorClave(limpiar(textoCelda(fila[c - 1])));   // «Titular | Juan Pérez»
          if (tipo) parrafosCelda(celda).forEach((p) => pistas.set(p, tipo));
        });
      });
    }
    return pistas;
  }

  /* ---------- Procesar un archivo XML del documento ---------- */
  function procesarParte(xml, opciones, estado, parrafosVista) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('XML inválido dentro del .docx');

    const pistas = pistasDeTablas(doc);
    for (const parrafo of doc.getElementsByTagNameNS(NS_W, 'p')) {
      const items = recolectar(parrafo);
      const texto = textoDe(items);
      if (!texto.trim()) continue;

      const forzados = [];
      const tipoPista = pistas.get(parrafo);
      if (tipoPista) {
        const ini = texto.length - texto.trimStart().length;
        forzados.push({ tipo: tipoPista, inicio: ini, fin: texto.trimEnd().length });
      }

      const r = Anonimax.anonimizar(texto, { ...opciones, forzados }, estado);
      if (r.hallazgos.length) aplicar(items, texto, r.hallazgos);
      parrafosVista.push({ texto, resultado: r.resultado, hallazgos: r.hallazgos });
    }

    // Autores de comentarios y de cambios: «w:author="Juan Pérez"» también es un dato personal
    for (const el of doc.getElementsByTagName('*')) {
      if (el.hasAttributeNS(NS_W, 'author')) el.setAttributeNS(NS_W, 'w:author', 'Autor');
      if (el.hasAttributeNS(NS_W, 'initials')) el.setAttributeNS(NS_W, 'w:initials', 'A');
    }

    // Algunos navegadores ya agregan la declaración <?xml ...?> al serializar y otros no:
    // si la repetimos el archivo queda inválido y Word no lo abre.
    const serializado = new XMLSerializer().serializeToString(doc);
    return serializado.startsWith('<?xml') ? serializado
      : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + serializado;
  }

  /* ---------- Metadatos y extras ---------- */
  const VACIAR = ['dc:creator', 'cp:lastModifiedBy', 'dc:title', 'dc:subject', 'cp:keywords', 'dc:description', 'Company', 'Manager'];
  function limpiarMetadatos(xml) {
    return VACIAR.reduce((acc, tag) => acc.replace(new RegExp(`(<${tag}(?:\\s[^>]*)?>)[^<]*(</${tag}>)`, 'g'), '$1$2'), xml);
  }

  // Los vínculos «mailto:juan@x.com» viven en los archivos .rels, no en el texto
  function limpiarVinculos(xml, opciones, estado) {
    return xml.replace(/Target="((?:mailto|tel):[^"]*)"/g, (todo, destino) => {
      const r = Anonimax.anonimizar(destino, opciones, estado);
      return `Target="${r.resultado.replace(/&/g, '&amp;')}"`;
    });
  }

  /* ---------- Función principal ---------- */
  async function procesar(buffer, opciones) {
    const zip = await JSZip.loadAsync(buffer);
    if (!zip.file('word/document.xml')) throw new Error('El archivo no parece un documento de Word válido.');

    const estado = Anonimax.nuevoEstado();
    const parrafos = [];
    const avisos = [];

    // El cuerpo primero, para que la numeración siga el orden de lectura
    const partes = Object.keys(zip.files).filter((n) => PARTE_TEXTO.test(n))
      .sort((a, b) => (b === 'word/document.xml') - (a === 'word/document.xml') || a.localeCompare(b));

    for (const nombre of partes) {
      const xml = await zip.file(nombre).async('string');
      zip.file(nombre, procesarParte(xml, opciones, estado, parrafos));
    }

    // Vínculos mailto: y tel:
    for (const nombre of Object.keys(zip.files).filter((n) => /^word\/_rels\/.+\.rels$/.test(n))) {
      const xml = await zip.file(nombre).async('string');
      zip.file(nombre, limpiarVinculos(xml, opciones, estado));
    }

    // Metadatos (autor, empresa, título…)
    for (const nombre of ['docProps/core.xml', 'docProps/app.xml']) {
      if (zip.file(nombre)) zip.file(nombre, limpiarMetadatos(await zip.file(nombre).async('string')));
    }

    // Miniatura del documento: es una imagen de la primera página, con los datos a la vista
    const miniaturas = Object.keys(zip.files).filter((n) => /^docProps\/thumbnail\./i.test(n));
    if (miniaturas.length) {
      miniaturas.forEach((n) => zip.remove(n));
      if (zip.file('_rels/.rels')) {
        const rels = await zip.file('_rels/.rels').async('string');
        zip.file('_rels/.rels', rels.replace(/<Relationship\b[^>]*thumbnail[^>]*\/>/gi, ''));
      }
    }

    // Lo que NO podemos limpiar: lo avisamos
    const imagenes = Object.keys(zip.files).filter((n) => /^word\/media\//.test(n));
    if (imagenes.length) avisos.push(`El documento tiene ${imagenes.length} imagen(es). El texto dentro de imágenes no se puede anonimizar: revisalas a mano.`);
    if (zip.file('word/vbaProject.bin')) avisos.push('El documento contiene macros.');

    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE',
    });

    return { blob, parrafos, estado, avisos };
  }

  return { procesar };
})();
