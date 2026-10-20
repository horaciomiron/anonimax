/* anonimizar-ui.js — conecta el formulario de anonimizar.html con el motor
   (anonymizer.js). Este archivo SÍ toca el DOM; el motor no.

   Flujo: submit → validar → leer texto (archivo o textarea) → Anonimax.anonimizar()
          → mostrar resultado → permitir copiar / descargar. */
(() => {
  'use strict';

  const MAX_BYTES = 5 * 1024 * 1024;        // 5 MB
  const LIMITE_VISTA = 100000;              // caracteres que mostramos en pantalla
  const EXTENSIONES = ['txt', 'csv', 'tsv', 'json', 'xml', 'html', 'htm', 'md', 'log'];
  const FORMATO_POR_EXT = { csv: 'csv', tsv: 'csv', json: 'json', xml: 'xml' };

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

  let ultimo = null;   // guarda {texto, nombre, extension} del último resultado para descargar/copiar

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
        const extra = ['pdf', 'docx', 'doc'].includes(ext)
          ? ' Todavía no leemos PDF ni Word: abrí el documento, copiá el texto y usá «Pegar texto».' : '';
        mostrarError('error-origen', `El formato .${ext || '(sin extensión)'} no está soportado.${extra}`, inputArchivo);
        primerError = inputArchivo;
      } else if (archivo.size > MAX_BYTES) {
        mostrarError('error-origen', 'El archivo supera los 5 MB.', inputArchivo);
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
  function pintar(contenedor, segmentos) {
    const fragmento = document.createDocumentFragment();
    segmentos.forEach((s) => {
      if (s.tipo) {
        const marca = document.createElement('mark');
        marca.textContent = s.texto;
        marca.title = Anonimax.TIPOS[s.tipo].etiqueta;
        fragmento.append(marca);
      } else {
        fragmento.append(document.createTextNode(s.texto));
      }
    });
    contenedor.replaceChildren(fragmento);
  }

  function mostrarResumen(resumen, total) {
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
    return total;
  }

  /* ---------- Envío del formulario ---------- */
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!validar()) return;

    estado.textContent = 'Procesando…';
    let texto, nombre, extension, formato;
    try {
      if (form.elements.origen.value === 'archivo') {
        const archivo = inputArchivo.files[0];
        texto = await archivo.text();                       // lee el archivo en el navegador
        extension = extensionDe(archivo.name);
        nombre = archivo.name.replace(/\.[^.]+$/, '');
        formato = FORMATO_POR_EXT[extension] || 'texto';
      } else {
        texto = areaTexto.value;
        nombre = 'texto';
        formato = selectFormato.value;
        extension = formato === 'texto' ? 'txt' : formato;
      }

      const tipos = [...form.querySelectorAll('input[name="tipos"]:checked')].map((c) => c.value);
      const extras = form.elements.extras.value.split(',');

      const r = Anonimax.anonimizar(texto, { tipos, extras, modo: form.elements.modo.value, formato });

      const limite = texto.length > LIMITE_VISTA ? LIMITE_VISTA : Infinity;
      pintar($('#visor-original'), Anonimax.segmentar(texto, r.hallazgos, limite));
      $('#visor-anonimizado').textContent = r.resultado.slice(0, limite === Infinity ? undefined : LIMITE_VISTA);
      $('#nota-vista').hidden = limite === Infinity;
      mostrarResumen(r.resumen, r.total);

      ultimo = { texto: r.resultado, nombre, extension };
      seccionResultado.hidden = false;
      estado.textContent = r.total
        ? `Listo: se ocultaron ${r.total} datos. Revisá el resultado más abajo.`
        : 'Listo, pero no se encontró ningún dato con los tipos elegidos.';
      $('#titulo-resultado').setAttribute('tabindex', '-1');
      $('#titulo-resultado').focus();                       // lleva el foco (y el lector de pantalla) al resultado
      seccionResultado.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      estado.textContent = 'Ocurrió un error al leer o procesar el archivo. Probá de nuevo.';
      console.error(error);
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
  $('#btn-descargar').addEventListener('click', () => {
    if (!ultimo) return;
    const tipoMime = { json: 'application/json', xml: 'application/xml', csv: 'text/csv' }[ultimo.extension] || 'text/plain';
    const blob = new Blob([ultimo.texto], { type: `${tipoMime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `${ultimo.nombre}-anonimizado.${ultimo.extension}`;
    enlace.click();
    URL.revokeObjectURL(url);
    estado.textContent = `Se descargó ${enlace.download}`;
  });

  $('#btn-copiar').addEventListener('click', async () => {
    if (!ultimo) return;
    try {
      await navigator.clipboard.writeText(ultimo.texto);
      estado.textContent = 'Texto anonimizado copiado al portapapeles.';
    } catch (e) {
      estado.textContent = 'No se pudo copiar automáticamente. Seleccioná el texto y copialo a mano.';
    }
  });
})();
