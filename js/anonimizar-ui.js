/* anonimizar-ui.js — conecta el formulario de anonimizar.html con los motores
     · anonymizer.js   → texto (TXT, CSV, JSON, XML, HTML, MD)
     · docx-handler.js → Word
     · pdf-handler.js  → PDF
   Este archivo SÍ toca el DOM; los motores no (salvo el PDF, que usa un <canvas>).

   Flujo: submit → validar → leer archivo → motor según el formato → mostrar
          resultado → permitir copiar / descargar.

   Las librerías pesadas (JSZip, pdf.js, pdf-lib) se cargan SOLO cuando el
   usuario sube un .docx o un .pdf («carga diferida»): el resto de las
   páginas no pierde velocidad por culpa de ellas. */
(() => {
  'use strict';

  const MAX_BYTES = 15 * 1024 * 1024;       // 15 MB
  const LIMITE_VISTA = 100000;              // caracteres que mostramos en pantalla
  const EXTENSIONES = ['docx', 'pdf', 'txt', 'csv', 'tsv', 'json', 'xml', 'html', 'htm', 'md', 'log'];
  const FORMATO_POR_EXT = { csv: 'csv', tsv: 'csv', json: 'json', xml: 'xml' };
  const TIPO_MIME = {
    json: 'application/json', xml: 'application/xml', csv: 'text/csv',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pdf: 'application/pdf',
  };

  const $ = (selector) => document.querySelector(selector);
  const form = $('#form-anonimizar');
  const inputArchivo = $('#archivo');
  const areaTexto = $('#texto');
  const selectFormato = $('#formato');
  const bloqueArchivo = $('#bloque-archivo');
  const bloqueTexto = $('#bloque-texto');
  const zona = $('#zona-archivo');
  const estado = $('#estado');
  const seccionResultado = $('#resultado');
  const botonEnviar = form.querySelector('button[type="submit"]');

  // Lo último que se procesó, para poder copiar/descargar:
  // { blob?, texto, textoPlano, nombre, extension }
  let ultimo = null;

  /* ---------- Carga diferida de librerías ---------- */
  const cargados = new Map();
  function cargarScript(ruta) {
    if (!cargados.has(ruta)) {
      cargados.set(ruta, new Promise((ok, mal) => {
        const s = document.createElement('script');
        s.src = ruta;
        s.onload = ok;
        s.onerror = () => { cargados.delete(ruta); mal(new Error(`No se pudo cargar ${ruta}`)); };
        document.head.append(s);
      }));
    }
    return cargados.get(ruta);
  }
  async function prepararLibrerias(extension) {
    if (extension === 'docx') {
      await cargarScript('../vendor/jszip.min.js');
    } else if (extension === 'pdf') {
      await Promise.all([cargarScript('../vendor/pdf.min.js'), cargarScript('../vendor/pdf-lib.min.js')]);
      PdfAnonimizador.configurar({ workerSrc: '../vendor/pdf.worker.min.js' });
    }
  }

  /* ---------- Mostrar/ocultar según el origen elegido ---------- */
  function actualizarOrigen() {
    const origen = form.elements.origen.value;
    bloqueArchivo.hidden = origen !== 'archivo';
    bloqueTexto.hidden = origen !== 'texto';
    limpiarErrores();
  }
  form.elements.origen.forEach((radio) => radio.addEventListener('change', actualizarOrigen));

  /* ---------- Parámetro ?tipo=csv que manda la página de herramientas ---------- */
  const tipoUrl = new URLSearchParams(window.location.search).get('tipo');
  if (tipoUrl) {
    const etiqueta = $('#herramienta-activa');
    etiqueta.textContent = tipoUrl.toUpperCase();
    etiqueta.hidden = false;
    if (tipoUrl === 'texto') {
      form.elements.origen.value = 'texto';
      actualizarOrigen();
    } else if (EXTENSIONES.includes(tipoUrl)) {
      inputArchivo.accept = `.${tipoUrl}`;
      if (FORMATO_POR_EXT[tipoUrl]) selectFormato.value = FORMATO_POR_EXT[tipoUrl];
    }
  }

  /* ---------- Arrastrar y soltar ---------- */
  ['dragenter', 'dragover'].forEach((nombre) => zona.addEventListener(nombre, (e) => { e.preventDefault(); zona.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((nombre) => zona.addEventListener(nombre, (e) => { e.preventDefault(); zona.classList.remove('is-over'); }));
  zona.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length) inputArchivo.files = e.dataTransfer.files;
  });

  /* ---------- Errores accesibles ---------- */
  function mostrarError(idError, mensaje, campo) {
    $(`#${idError}`).textContent = mensaje;
    if (campo) campo.setAttribute('aria-invalid', 'true');
  }
  function limpiarErrores() {
    document.querySelectorAll('.error').forEach((p) => { p.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach((c) => c.removeAttribute('aria-invalid'));
  }

  const extensionDe = (nombre) => (nombre.includes('.') ? nombre.split('.').pop().toLowerCase() : '');

  /* ---------- Validación ---------- */
  function validar() {
    limpiarErrores();
    const origen = form.elements.origen.value;
    let primerError = null;

    if (origen === 'archivo') {
      const archivo = inputArchivo.files[0];
      if (!archivo) {
        mostrarError('error-origen', 'Elegí un archivo para continuar.', inputArchivo);
        primerError = inputArchivo;
      } else if (!EXTENSIONES.includes(extensionDe(archivo.name))) {
        const ext = extensionDe(archivo.name);
        const extra = ['doc', 'rtf', 'odt'].includes(ext)
          ? ' Guardalo como .docx desde Word («Guardar como») y volvé a subirlo.' : '';
        mostrarError('error-origen', `El formato .${ext || '(sin extensión)'} no está soportado.${extra}`, inputArchivo);
        primerError = inputArchivo;
      } else if (archivo.size > MAX_BYTES) {
        mostrarError('error-origen', 'El archivo supera los 15 MB.', inputArchivo);
        primerError = inputArchivo;
      }
    } else if (!areaTexto.value.trim()) {
      mostrarError('error-origen', 'Pegá el texto que querés anonimizar.', areaTexto);
      primerError = areaTexto;
    }

    const tiposElegidos = [...form.querySelectorAll('input[name="tipos"]:checked')];
    const hayExtras = form.elements.extras.value.trim() !== '';
    if (!tiposElegidos.length && !hayExtras) {
      mostrarError('error-tipos', 'Marcá al menos un tipo de dato o escribí una palabra adicional.');
      primerError = primerError || form.querySelector('input[name="tipos"]');
    }

    if (primerError) { primerError.focus(); return false; }
    return true;
  }

  /* ---------- Resultado en pantalla (sin innerHTML) ---------- */
  // «partes» = [{ etiqueta?, texto, resultado, hallazgos }]: un párrafo de Word,
  // una página de PDF, o el texto completo.
  function pintarOriginal(contenedor, partes) {
    const fragmento = document.createDocumentFragment();
    let usados = 0;
    let recortado = false;
    for (const parte of partes) {
      if (usados > LIMITE_VISTA) { recortado = true; break; }
      if (parte.etiqueta) fragmento.append(document.createTextNode(`— ${parte.etiqueta} —\n`));
      Anonimax.segmentar(parte.texto, parte.hallazgos).forEach((s) => {
        if (s.tipo) {
          const marca = document.createElement('mark');
          marca.textContent = s.texto;
          marca.title = Anonimax.TIPOS[s.tipo].etiqueta;
          fragmento.append(marca);
        } else {
          fragmento.append(document.createTextNode(s.texto));
        }
      });
      fragmento.append(document.createTextNode('\n'));
      usados += parte.texto.length;
    }
    contenedor.replaceChildren(fragmento);
    return recortado;
  }

  function textoAnonimizado(partes) {
    return partes.map((p) => (p.etiqueta ? `— ${p.etiqueta} —\n` : '') + p.resultado).join('\n');
  }

  function mostrarResumen(resumen) {
    const ul = $('#resumen');
    const items = Object.keys(resumen).map((tipo) => {
      const li = document.createElement('li');
      const n = document.createElement('strong');
      n.textContent = resumen[tipo];
      li.append(`${Anonimax.TIPOS[tipo].etiqueta}: `, n);
      return li;
    });
    if (!items.length) {
      const li = document.createElement('li');
      li.textContent = 'No se encontraron datos con los tipos elegidos.';
      items.push(li);
    }
    ul.replaceChildren(...items);
  }

  function mostrarAvisos(avisos) {
    const caja = $('#avisos');
    caja.replaceChildren(...avisos.map((a) => { const p = document.createElement('p'); p.textContent = a; return p; }));
    caja.hidden = !avisos.length;
  }

  /* ---------- Procesar según el tipo de archivo ---------- */
  async function procesar(opciones) {
    if (form.elements.origen.value === 'texto') {
      const formato = selectFormato.value;
      const texto = areaTexto.value;
      const r = Anonimax.anonimizar(texto, { ...opciones, formato });
      return {
        partes: [{ texto, resultado: r.resultado, hallazgos: r.hallazgos }],
        resumen: r.resumen, avisos: [],
        salida: { texto: r.resultado, nombre: 'texto', extension: formato === 'texto' ? 'txt' : formato },
      };
    }

    const archivo = inputArchivo.files[0];
    const extension = extensionDe(archivo.name);
    const nombre = archivo.name.replace(/\.[^.]+$/, '');

    if (extension === 'docx' || extension === 'pdf') {
      estado.textContent = 'Cargando herramientas…';
      await prepararLibrerias(extension);
      const buffer = await archivo.arrayBuffer();
      let r;
      if (extension === 'docx') {
        r = await DocxAnonimizador.procesar(buffer, opciones);
      } else {
        r = await PdfAnonimizador.procesar(buffer, opciones, (n, total) => { estado.textContent = `Procesando página ${n} de ${total}…`; });
        if (r.escaneado) {
          const e = new Error('PDF_ESCANEADO');
          e.esEscaneado = true;
          throw e;
        }
      }
      const partes = r.paginas || r.parrafos;
      return {
        partes, resumen: r.estado.resumen, avisos: r.avisos,
        salida: { blob: r.blob, nombre, extension, textoPlano: textoAnonimizado(partes) },
      };
    }

    // Archivos de texto
    const texto = await archivo.text();
    const formato = FORMATO_POR_EXT[extension] || 'texto';
    const r = Anonimax.anonimizar(texto, { ...opciones, formato });
    return {
      partes: [{ texto, resultado: r.resultado, hallazgos: r.hallazgos }],
      resumen: r.resumen, avisos: [],
      salida: { texto: r.resultado, nombre, extension },
    };
  }

  /* ---------- Envío del formulario ---------- */
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!validar()) return;

    botonEnviar.disabled = true;
    estado.textContent = 'Procesando…';
    seccionResultado.hidden = true;
    try {
      const opciones = {
        tipos: [...form.querySelectorAll('input[name="tipos"]:checked')].map((c) => c.value),
        extras: form.elements.extras.value.split(','),
        modo: form.elements.modo.value,
      };
      const r = await procesar(opciones);

      const recortado = pintarOriginal($('#visor-original'), r.partes);
      const anonimizado = textoAnonimizado(r.partes);
      $('#visor-anonimizado').textContent = anonimizado.length > LIMITE_VISTA ? anonimizado.slice(0, LIMITE_VISTA) : anonimizado;
      $('#nota-vista').hidden = !(recortado || anonimizado.length > LIMITE_VISTA);
      mostrarResumen(r.resumen);
      mostrarAvisos(r.avisos);

      ultimo = r.salida;
      $('#btn-descargar-txt').hidden = !ultimo.blob;          // el botón del .txt solo aparece con Word/PDF
      const total = Object.values(r.resumen).reduce((a, b) => a + b, 0);
      seccionResultado.hidden = false;
      estado.textContent = total
        ? `Listo: se ocultaron ${total} datos. Revisá el resultado más abajo.`
        : 'Listo, pero no se encontró ningún dato con los tipos elegidos.';
      $('#titulo-resultado').setAttribute('tabindex', '-1');
      $('#titulo-resultado').focus();                         // lleva el foco (y el lector de pantalla) al resultado
      seccionResultado.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      if (error.esEscaneado) {
        estado.textContent = '';
        mostrarError('error-origen',
          'Este PDF no tiene texto que se pueda leer (parece escaneado, es decir una foto del documento). ' +
          'No generamos un archivo para no darte una falsa sensación de seguridad: todavía no incluimos OCR.', inputArchivo);
        inputArchivo.focus();
      } else {
        estado.textContent = 'No pudimos procesar el archivo. Puede estar dañado, protegido con contraseña o no ser un documento válido.';
        console.error(error);
      }
    } finally {
      botonEnviar.disabled = false;
    }
  });

  form.addEventListener('reset', () => {
    // El reset del navegador ocurre DESPUÉS de este evento; esperamos un instante para ordenar la pantalla
    setTimeout(() => {
      seccionResultado.hidden = true;
      estado.textContent = '';
      ultimo = null;
      actualizarOrigen();
    }, 0);
  });

  /* ---------- Descargar y copiar ---------- */
  function descargar(contenido, nombreArchivo, tipo) {
    const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: `${tipo};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivo;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    estado.textContent = `Se descargó ${nombreArchivo}`;
  }

  $('#btn-descargar').addEventListener('click', () => {
    if (!ultimo) return;
    const nombre = `${ultimo.nombre}-anonimizado.${ultimo.extension}`;
    descargar(ultimo.blob || ultimo.texto, nombre, TIPO_MIME[ultimo.extension] || 'text/plain');
  });

  $('#btn-descargar-txt').addEventListener('click', () => {
    if (ultimo && ultimo.textoPlano) descargar(ultimo.textoPlano, `${ultimo.nombre}-anonimizado.txt`, 'text/plain');
  });

  $('#btn-copiar').addEventListener('click', async () => {
    if (!ultimo) return;
    try {
      await navigator.clipboard.writeText(ultimo.textoPlano || ultimo.texto);
      estado.textContent = 'Texto anonimizado copiado al portapapeles.';
    } catch (e) {
      estado.textContent = 'No se pudo copiar automáticamente. Seleccioná el texto y copialo a mano.';
    }
  });
})();
