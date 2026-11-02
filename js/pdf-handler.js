/* =====================================================================
   pdf-handler.js — Anonimiza archivos PDF
   ---------------------------------------------------------------------
   POR QUÉ NO SE "EDITA" EL PDF:
   Dibujar un rectángulo negro ENCIMA del texto no lo borra: el texto
   sigue debajo y se puede seleccionar, copiar o extraer. Es el error más
   común (y peligroso) al "tachar" documentos.

   LO QUE HACEMOS (redacción segura):
     1. pdf.js lee el texto de cada página y la POSICIÓN de cada trozo.
     2. El motor (Anonimax) detecta los datos sensibles en ese texto.
     3. Dibujamos la página en un <canvas> (una imagen) y tapamos con negro
        las zonas donde estaban los datos.
     4. pdf-lib arma un PDF nuevo cuyas páginas son esas imágenes.
   El resultado ya no contiene el texto original: lo que se tapó
   no se puede recuperar. A cambio, el texto del PDF nuevo no es
   seleccionable (son imágenes).

   LÍMITE IMPORTANTE: un PDF escaneado (una foto de un documento) no tiene
   texto que leer. Para esos haría falta OCR. En ese caso NO generamos un
   archivo, para no dar una falsa sensación de seguridad.

   Requiere: pdf.js (pdfjsLib), pdf-lib (PDFLib) y Anonimax.
   ===================================================================== */

const PdfAnonimizador = (() => {
  'use strict';

  const ESCALA = 2;            // 2 = unos 144 dpi: legible y liviano
  const LADO_MAXIMO = 3000;    // evita canvas gigantes en páginas enormes
  const MINIMO_TEXTO = 20;     // menos caracteres que esto = «no tiene texto»

  function configurar({ workerSrc }) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(workerSrc, document.baseURI).href;
  }

  /* ---------- 1) Armar el texto de la página y recordar de dónde sale cada letra ---------- */
  // Un PDF no tiene «párrafos»: tiene trocitos de texto con coordenadas.
  // Los unimos en un texto legible (con espacios y saltos de línea) y guardamos,
  // para cada carácter, a qué trocito pertenece (para poder dibujar el recuadro después).
  function construirTexto(items, viewport) {
    const trozos = [];
    for (const it of items) {
      if (typeof it.str !== 'string' || it.str === '') continue;   // los vacíos son solo marcas de fin de línea
      const m = pdfjsLib.Util.transform(viewport.transform, it.transform);   // a PÍXELES del canvas
      trozos.push({
        str: it.str,
        fuente: it.fontName,
        x: m[4], y: m[5],
        alto: Math.hypot(m[2], m[3]) || 10,
        angulo: Math.atan2(m[1], m[0]),
        ancho: it.width * viewport.scale,
        finDeLinea: !!it.hasEOL,
      });
    }

    let texto = '';
    const saltosBlandos = [];  // posiciones de los espacios que pusimos al unir renglones del mismo párrafo
    const trozoDe = [];      // trozoDe[i] = índice del trozo al que pertenece el carácter i (-1 = separador inventado)
    const posDe = [];        // posDe[i]   = posición del carácter dentro de ese trozo
    trozos.forEach((t, n) => {
      for (let k = 0; k < t.str.length; k++) { texto += t.str[k]; trozoDe.push(n); posDe.push(k); }
      const sig = trozos[n + 1];
      if (!sig) return;
      let sep = '';
      const saltoVertical = Math.abs(sig.y - t.y);
      if (saltoVertical > 0.5 * t.alto) {
        // Renglones pegados (interlineado normal ≈ 1,2 veces el tamaño de letra) = mismo párrafo:
        // la línea se cortó solo por el ancho de la página. Los unimos con un espacio para que un
        // nombre o dirección partido en dos renglones se detecte como uno solo.
        sep = saltoVertical < 1.45 * t.alto ? ' ' : '\n';
        if (sep === ' ') saltosBlandos.push(texto.length);
      } else if (t.finDeLinea) sep = '\n';
      else if (sig.x - (t.x + t.ancho) > 0.12 * t.alto && !t.str.endsWith(' ') && !sig.str.startsWith(' ')) sep = ' ';
      for (const c of sep) { texto += c; trozoDe.push(-1); posDe.push(-1); }
    });
    return { texto, trozos, trozoDe, posDe, saltosBlandos };
  }

  // Un correo en una celda angosta se parte en dos renglones: «lucia@eje» + «mplo.com».
  // Como unimos esos renglones con un espacio, buscamos los pares de «palabras» que,
  // pegadas, forman un correo completo (y por separado no lo son).
  const RE_CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
  function correosPartidos(texto, saltosBlandos) {
    const encontrados = [];
    for (const p of saltosBlandos) {
      const ini = Math.max(texto.lastIndexOf(' ', p - 1), texto.lastIndexOf('\n', p - 1)) + 1;
      let fin = texto.length;
      for (const sep of [' ', '\n']) { const i = texto.indexOf(sep, p + 1); if (i !== -1) fin = Math.min(fin, i); }
      const finLimpio = fin - (texto.slice(p + 1, fin).match(/[.,;:)\]]+$/) || [''])[0].length;
      const izquierda = texto.slice(ini, p);
      const unido = izquierda + texto.slice(p + 1, finLimpio);
      if (RE_CORREO.test(unido) && !RE_CORREO.test(izquierda)) encontrados.push({ tipo: 'email', inicio: ini, fin: finLimpio });
    }
    return encontrados;
  }

  /* ---------- 2) De «hallazgo» a rectángulos en la imagen ---------- */
  function rectangulos(hallazgo, info, ctx, pagina) {
    // Qué parte de cada trozo cae dentro del hallazgo
    const tramos = new Map();
    for (let i = hallazgo.inicio; i < hallazgo.fin; i++) {
      const n = info.trozoDe[i];
      if (n < 0) continue;
      const k = info.posDe[i];
      const t = tramos.get(n) || { desde: k, hasta: k + 1 };
      t.desde = Math.min(t.desde, k);
      t.hasta = Math.max(t.hasta, k + 1);
      tramos.set(n, t);
    }

    const rects = [];
    for (const [n, tr] of tramos) {
      const t = info.trozos[n];
      // Medimos con la fuente real del PDF (si ya está cargada) para ubicar bien cada letra
      let familia = 'sans-serif';
      try {
        const f = pagina.commonObjs.get(t.fuente);
        if (f && f.loadedName) familia = `"${f.loadedName}", sans-serif`;
      } catch (e) { /* la fuente todavía no está lista: usamos una genérica */ }
      ctx.font = `${t.alto}px ${familia}`;
      const total = ctx.measureText(t.str).width || 1;
      const x0 = t.ancho * ctx.measureText(t.str.slice(0, tr.desde)).width / total;
      const x1 = t.ancho * ctx.measureText(t.str.slice(0, tr.hasta)).width / total;
      rects.push({ t, x0, x1 });
    }
    return rects;
  }

  function tapar(ctx, rects) {
    ctx.fillStyle = '#000';
    rects.forEach((r, i) => {
      const { t } = r;
      const margen = t.alto * 0.12;                       // un poco de aire para no dejar bordes de letras
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.angulo);
      ctx.fillRect(r.x0 - margen, -t.alto * 0.95, (r.x1 - r.x0) + 2 * margen, t.alto * 1.3);
      // Si el hallazgo continúa en el trozo siguiente de la misma línea, rellenamos el hueco
      const sig = rects[i + 1];
      if (sig && Math.abs(sig.t.y - t.y) < 0.5 * t.alto && Math.abs(t.angulo) < 0.01) {
        const finActual = t.x + r.x1;
        const iniSig = sig.t.x + sig.x0;
        if (iniSig > finActual) ctx.fillRect(r.x1, -t.alto * 0.95, iniSig - finActual, t.alto * 1.3);
      }
      ctx.restore();
    });
  }

  /* ---------- 3) Función principal ---------- */
  async function procesar(buffer, opciones, onProgreso = () => {}) {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const estado = Anonimax.nuevoEstado();
    const salida = await PDFLib.PDFDocument.create();
    const paginas = [];
    const avisos = [];
    const sinTexto = [];
    const conImagenes = [];
    let caracteres = 0;

    for (let n = 1; n <= pdf.numPages; n++) {
      onProgreso(n, pdf.numPages);
      const pagina = await pdf.getPage(n);
      const unidad = pagina.getViewport({ scale: 1 });
      const escala = Math.min(ESCALA, LADO_MAXIMO / Math.max(unidad.width, unidad.height));
      const viewport = pagina.getViewport({ scale: escala });

      // a) Texto y posiciones
      const contenido = await pagina.getTextContent();
      const info = construirTexto(contenido.items, viewport);
      caracteres += info.texto.trim().length;
      if (info.texto.trim().length < 5) sinTexto.push(n);

      // Imágenes dentro de la página: su texto (si lo tienen) no se puede leer sin OCR
      try {
        const ops = await pagina.getOperatorList();
        const OPS = pdfjsLib.OPS;
        if (ops.fnArray.some((f) => f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject || f === OPS.paintImageMaskXObject)) conImagenes.push(n);
      } catch (e) { /* si no se puede revisar, seguimos */ }

      // b) Dibujar la página
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pagina.render({ canvasContext: ctx, viewport }).promise;

      // c) Detectar y tapar (el estado compartido mantiene NOMBRE_1, NOMBRE_2… coherentes en todo el PDF)
      const r = Anonimax.anonimizar(info.texto, { ...opciones, forzados: correosPartidos(info.texto, info.saltosBlandos) }, estado);
      // Los rectángulos de un mismo hallazgo van juntos: así se rellenan los huecos entre trozos
      r.hallazgos.forEach((h) => tapar(ctx, rectangulos(h, info, ctx, pagina)));
      paginas.push({ etiqueta: `Página ${n}`, texto: info.texto, resultado: r.resultado, hallazgos: r.hallazgos });

      // d) Agregar la imagen como página del PDF nuevo
      const blobJpg = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.88));
      const imagen = await salida.embedJpg(new Uint8Array(await blobJpg.arrayBuffer()));
      const nueva = salida.addPage([unidad.width, unidad.height]);
      nueva.drawImage(imagen, { x: 0, y: 0, width: unidad.width, height: unidad.height });
      canvas.width = canvas.height = 0;                    // liberar memoria
      pagina.cleanup();
    }

    // PDF sin texto = escaneado: no entregamos un archivo que parezca protegido y no lo esté
    if (caracteres < MINIMO_TEXTO) {
      return { escaneado: true, paginas, estado, avisos: [] };
    }
    if (sinTexto.length) {
      const plural = sinTexto.length > 1;
      avisos.push(`${plural ? 'Las páginas' : 'La página'} ${sinTexto.join(', ')} ${plural ? 'no tienen' : 'no tiene'} texto reconocible (${plural ? 'pueden ser imágenes escaneadas' : 'puede ser una imagen escaneada'}). Sus datos NO fueron tapados: revisalas a mano.`);
    }

    if (conImagenes.length) {
      avisos.push(`${conImagenes.length > 1 ? 'Las páginas' : 'La página'} ${conImagenes.join(', ')} ${conImagenes.length > 1 ? 'contienen' : 'contiene'} imágenes. Si tienen texto dentro (firmas, sellos, capturas), NO fue tapado: revisalas a mano.`);
    }

    // Metadatos del PDF nuevo: sin autor ni título del original
    salida.setTitle('Documento anonimizado');
    salida.setAuthor('');
    salida.setSubject('');
    salida.setKeywords([]);
    salida.setProducer('AnonimaX');
    salida.setCreator('AnonimaX');

    const bytes = await salida.save();
    return { blob: new Blob([bytes], { type: 'application/pdf' }), paginas, estado, avisos, escaneado: false };
  }

  return { procesar, configurar };
})();
