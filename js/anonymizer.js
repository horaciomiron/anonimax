/* =====================================================================
   anonymizer.js — Motor de anonimización de AnonimaX
   ---------------------------------------------------------------------
   - No usa librerías: solo JavaScript puro y expresiones regulares.
   - No toca el DOM: recibe texto y devuelve texto. Por eso se puede
     probar en Node (tests/anonymizer.test.js) además del navegador.
   - Todo ocurre en el navegador: el documento nunca se sube a un servidor.

   IDEA GENERAL (leela antes de leer el código):
     1. DETECTAR: cada "detector" es una expresión regular que encuentra
        un tipo de dato (email, DNI, teléfono, etc.).
     2. RESOLVER SUPERPOSICIONES: si dos detectores marcan el mismo trozo
        (ej.: un CUIT contiene un número que parece DNI) gana el de mayor
        prioridad.
     3. REEMPLAZAR: se arma el texto nuevo según el modo elegido
        (etiquetas, bloques negros o enmascarado).
   ===================================================================== */

const Anonimax = (() => {
  'use strict';

  /* -------------------------------------------------------------------
     1) CATÁLOGO DE TIPOS DE DATOS
     La clave (ej. "dni") es la que usan los checkboxes del HTML.
  ------------------------------------------------------------------- */
  const TIPOS = {
    nombre:        { etiqueta: 'Nombres y apellidos',            tag: 'NOMBRE' },
    dni:           { etiqueta: 'DNI / documento',                tag: 'DNI' },
    cuit:          { etiqueta: 'CUIT / CUIL',                    tag: 'CUIT' },
    email:         { etiqueta: 'Correos electrónicos',           tag: 'EMAIL' },
    telefono:      { etiqueta: 'Teléfonos',                      tag: 'TELEFONO' },
    domicilio:     { etiqueta: 'Domicilios y direcciones',       tag: 'DOMICILIO' },
    cuenta:        { etiqueta: 'Cuentas bancarias (CBU, CVU, IBAN, alias)', tag: 'CUENTA' },
    tarjeta:       { etiqueta: 'Tarjetas de crédito/débito',     tag: 'TARJETA' },
    patente:       { etiqueta: 'Patentes de vehículos',          tag: 'PATENTE' },
    fecha:         { etiqueta: 'Fechas',                         tag: 'FECHA' },
    personalizado: { etiqueta: 'Palabras que agregaste vos',     tag: 'DATO' },
  };

  /* -------------------------------------------------------------------
     2) PIEZAS PARA ARMAR EXPRESIONES REGULARES
     Ojo: \b (límite de palabra) NO entiende letras con tilde ni la ñ.
     Por eso usamos "lookarounds" con \p{L} (cualquier letra Unicode):
        (?<![\p{L}\d])  = "no hay una letra/número justo antes"
        (?![\p{L}\d])   = "no hay una letra/número justo después"
  ------------------------------------------------------------------- */
  const ANTES = '(?<![\\p{L}\\d])';
  const DESPUES = '(?![\\p{L}\\d])';

  // Una palabra de nombre propio: "Pérez" o "PÉREZ"
  const PAL = "(?:\\p{Lu}[\\p{Ll}'’-]+|\\p{Lu}{2,})";
  // Conectores típicos: "María de los Ángeles", "Juan de la Cruz"
  const NEXO = '(?:de|del|la|las|los|y|van|von|da|di|dos)';
  // Nombre completo: hasta 5 palabras, o formato "APELLIDO, Nombre"
  const NOMBRE_COMPLETO =
    `${PAL}(?:(?:,\\s*\\p{Lu}[\\p{Ll}'’-]+|\\s+(?:${NEXO}\\s+)*${PAL})){0,4}`;

  // Convierte "dni" en "[dD][nN][iI]" para ignorar mayúsculas sin usar el
  // flag "i" (que haría que \p{Lu} también acepte minúsculas).
  const ci = (s) => s.replace(/\p{L}/gu, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
  const palabras = (lista) =>
    lista.map((frase) => frase.split(' ').map(ci).join('\\s+')).join('|');

  const TITULOS = [
    'sr', 'sra', 'srta', 'dr', 'dra', 'lic', 'ing', 'abog', 'arq', 'cdor', 'cdora', 'prof',
    'don', 'doña', 'dña', 'señor', 'señora', 'señorita', 'doctor', 'doctora',
    'licenciado', 'licenciada', 'ingeniero', 'ingeniera', 'abogado', 'abogada',
    'escribano', 'escribana', 'profesor', 'profesora',
  ];

  const ETIQUETAS_NOMBRE = [
    'nombre y apellido', 'nombres y apellidos', 'apellido y nombre', 'apellidos y nombres',
    'nombre completo', 'nombre', 'nombres', 'apellido', 'apellidos', 'titular', 'cliente',
    'paciente', 'demandante', 'demandado', 'demandada', 'actor', 'actora', 'imputado',
    'imputada', 'denunciante', 'testigo', 'firmante', 'solicitante', 'beneficiario',
    'beneficiaria', 'contratante', 'locatario', 'locataria', 'locador', 'locadora',
    'vendedor', 'vendedora', 'comprador', 'compradora', 'empleado', 'empleada',
    'representante', 'apoderado', 'apoderada',
  ];

  // Nombres de pila frecuentes (sirven para reconocer "Juan Carlos Pérez" aunque
  // no tenga un "Sr." delante). Es una lista corta a propósito: se puede ampliar.
  const NOMBRES_PILA = (
    'Juan Carlos José Luis Jorge Miguel Pedro Pablo Diego Martín Matías Nicolás Lucas Facundo ' +
    'Santiago Sebastián Gabriel Fernando Alejandro Eduardo Ricardo Roberto Daniel Marcelo Mario ' +
    'Oscar Héctor Raúl Rubén Julio Hugo Gustavo Claudio Sergio Javier Adrián Andrés Ángel ' +
    'Antonio Alberto Alfredo Ariel Armando Bruno César Cristian Damián Emiliano Emilio Ernesto ' +
    'Esteban Federico Felipe Francisco Gonzalo Guillermo Horacio Ignacio Ismael Joaquín Leandro ' +
    'Leonardo Lisandro Manuel Mauricio Maximiliano Máximo Mariano Nelson Norberto Osvaldo ' +
    'Patricio Rodrigo Rafael Ramón Santino Tomás Valentín Víctor Walter Agustín Alan Axel ' +
    'Benjamín Bautista Thiago Lautaro Franco Ezequiel Fabián Gerardo Germán Iván Lorenzo ' +
    'Marcos Mateo Nahuel Ramiro Gastón Hernán Ulises Elías Emanuel ' +
    'María Ana Laura Marta Susana Carolina Claudia Silvia Patricia Graciela Mónica Alejandra ' +
    'Andrea Valeria Verónica Romina Natalia Florencia Camila Lucía Julieta Sofía Martina ' +
    'Valentina Agustina Micaela Belén Milagros Rocío Paula Gabriela Mariana Cecilia Cristina ' +
    'Daniela Débora Elena Eugenia Fernanda Josefina Karina Liliana Lorena Luciana Marcela ' +
    'Margarita Marisa Noelia Nora Norma Olga Raquel Rosa Sandra Sabrina Soledad Stella Teresa ' +
    'Viviana Yamila Antonella Candela Carla Celeste Clara Delfina Emilia Esther Estela Eva Inés ' +
    'Isabel Jimena Lidia Lola Magdalena Malena Mirta Miriam Renata Ruth Sara Tamara Zoe Ailén ' +
    'Brenda Dolores Guadalupe Jazmín Mía Ofelia Catalina Ángela Beatriz Dora Griselda Hilda ' +
    'Irma Juana Lucrecia Rita Alicia Analía Victoria'
  ).split(' ');

  const sinTildes = (s) => s.normalize('NFD').replace(/\p{M}/gu, '');

  // Conjunto para consultas rápidas (en minúsculas y sin tildes)
  const SET_NOMBRES = new Set(NOMBRES_PILA.map((n) => sinTildes(n).toLowerCase()));

  // Variantes que aceptamos: "María", "Maria", "MARÍA", "MARIA"
  const VARIANTES_NOMBRES = [...new Set(
    NOMBRES_PILA.flatMap((n) => [n, sinTildes(n), n.toUpperCase(), sinTildes(n).toUpperCase()])
  )].sort((a, b) => b.length - a.length).join('|');

  /* -------------------------------------------------------------------
     3) FUNCIONES DE VALIDACIÓN Y AJUSTE
  ------------------------------------------------------------------- */

  // Algoritmo de Luhn: sirve para confirmar que un número es una tarjeta real
  // y no cualquier número largo (reduce falsos positivos).
  function luhn(digitos) {
    let suma = 0;
    let doble = false;
    for (let i = digitos.length - 1; i >= 0; i--) {
      let n = Number(digitos[i]);
      if (doble) { n *= 2; if (n > 9) n -= 9; }
      suma += n;
      doble = !doble;
    }
    return suma % 10 === 0;
  }

  const PALABRAS_NO_NOMBRE = /^(DNI|CUIT|CUIL|CBU|CVU|MP|MN|SA|SRL|SAS|LE|LC|MAT)$/;

  // Quita del final del nombre palabras que no lo son ("Juan Pérez DNI" -> "Juan Pérez")
  function recortarNombre(valor) {
    const partes = valor.split(/(\s+|,\s*)/);
    while (partes.length) {
      const ultima = partes[partes.length - 1];
      if (/^(\s+|,\s*)$/.test(ultima) || PALABRAS_NO_NOMBRE.test(ultima)) partes.pop();
      else break;
    }
    return partes.join('');
  }

  const TOPONIMOS = /^(Santiago del Estero|San |Santa )/;

  // Dinero argentino: $ 12.345.678,50  -> no es un DNI
  function pareceDinero(texto, inicio, fin) {
    const antes = texto.slice(Math.max(0, inicio - 4), inicio);
    const despues = texto.slice(fin, fin + 3);
    return /[$€]\s*$/.test(antes) || /^,\d/.test(despues) || /^\.\d/.test(despues);
  }

  /* -------------------------------------------------------------------
     4) DETECTORES
     Cada uno tiene:
       tipo       → clave de TIPOS
       prioridad  → menor número = gana en caso de superposición
       re         → expresión regular (flag g = todas, u = unicode, d = índices)
       grupo      → qué grupo de captura se oculta (0 = todo lo encontrado)
       validar    → (valor, texto, inicio, fin) => true/false  (opcional)
       ajustar    → (valor) => valor recortado                  (opcional)
  ------------------------------------------------------------------- */
  const tituloRE = `(?:(?:${palabras(TITULOS)})\\.?\\s+)+`;
  const etiquetaRE = `(?:${palabras(ETIQUETAS_NOMBRE)})`;
  const viaRE = 'calle|av|avda|avenida|pasaje|pje|diagonal|diag|bv|bvd|bulevar|boulevard|ruta|camino|autopista';
  const unidadRE = '(?:piso|p\\.|dpto|depto|dto|of|oficina|uf)\\.?\\s*[\\p{L}\\d°º]+';
  const PALDIR = "[\\p{L}\\d.'’°º-]+";

  const DETECTORES = [
    // ---- Correo electrónico
    { tipo: 'email', prioridad: 1,
      re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/gd },

    // ---- CUIT / CUIL: 20-12345678-9 (con o sin guiones)
    { tipo: 'cuit', prioridad: 1,
      re: /(?<!\d)(?:20|23|24|25|26|27|30|33|34)-?\d{8}-?\d(?!\d)/gd },

    // ---- Cuentas bancarias
    { tipo: 'cuenta', prioridad: 1, re: /(?<!\d)\d{22}(?!\d)/gd },                       // CBU / CVU
    { tipo: 'cuenta', prioridad: 1,
      re: /(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?(?![A-Za-z0-9])/gd }, // IBAN
    { tipo: 'cuenta', prioridad: 1, grupo: 1,
      re: /(?<![\p{L}\d])(?:cuenta|cta)\.?(?:\s+(?:corriente|bancaria|n[°º.]|nro\.?|número))*\s*:?\s*(\d[\d\-/.]{5,22}\d)/giud },
    { tipo: 'cuenta', prioridad: 1, grupo: 1,
      re: /(?<![\p{L}\d])alias\s*:?\s*([a-z0-9-]{3,20}(?:\.[a-z0-9-]{2,20}){1,2})/giud },

    // ---- Tarjetas (13 a 19 dígitos con formato de tarjeta que además pasen Luhn)
    { tipo: 'tarjeta', prioridad: 1,
      re: /(?<![\d+])(?:\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{1,7}|\d{4}[ -]?\d{6}[ -]?\d{5})(?!\d)/gd,   // 4-4-4-x o Amex 4-6-5
      validar: (v) => { const d = v.replace(/\D/g, ''); return d.length >= 13 && d.length <= 19 && luhn(d); } },

    // ---- Teléfonos
    { tipo: 'telefono', prioridad: 2,                                                       // +54 9 11 5555-1234
      re: /(?<!\d)\+54[ .-]?(?:9[ .-]?)?\(?\d{2,4}\)?[ .-]?\d{3,4}[ .-]?\d{4}(?!\d)/gd },
    { tipo: 'telefono', prioridad: 2,                                                       // (0351) 15 555-1234
      re: /(?<!\d)\(?0\d{2,4}\)?[ .-]?(?:15[ .-]?)?\d{3,4}[ .-]?\d{4}(?!\d)/gd },
    { tipo: 'telefono', prioridad: 2, re: /(?<!\d)11[ .-]?\d{4}[ .-]?\d{4}(?!\d)/gd },    // 11 5555-1234
    { tipo: 'telefono', prioridad: 2, re: /(?<!\d)15[ .-]?\d{4}[ .-]?\d{4}(?!\d)/gd },    // 15-5555-1234
    { tipo: 'telefono', prioridad: 2, grupo: 1,                                             // Tel: 4555-1234
      re: /(?<![\p{L}\d])(?:tel|tel[eé]fono|cel|celular|whatsapp|wsp|m[oó]vil)\.?\s*:?\s*(\+?\d[\d\s().-]{5,18}\d)/giud },

    // ---- DNI
    { tipo: 'dni', prioridad: 3, grupo: 1,                                                  // DNI 12.345.678
      re: /(?<![\p{L}\d])(?:D\.?\s?N\.?\s?I\.?|documento(?:\s+nacional\s+de\s+identidad)?|doc\.?)["']?\s*(?:n[°º.o]*|nro\.?|número)?\s*:?\s*["']?(\d{1,2}\.?\d{3}\.?\d{3})(?!\d)/giud },
    { tipo: 'dni', prioridad: 3,                                                            // 12.345.678 suelto
      re: /(?<![\d.])\d{2}\.\d{3}\.\d{3}(?!\d)/gd,
      validar: (v, t, i, f) => !pareceDinero(t, i, f) },

    // ---- Domicilios
    { tipo: 'domicilio', prioridad: 4,                                                      // Av. Corrientes 1234, piso 5 dpto B
      re: new RegExp(
        `${ANTES}(?:${viaRE})\\.?\\s+${PALDIR}(?:\\s+${PALDIR}){0,4}?\\s*(?:n[°º.]*\\s*|nro\\.?\\s*)?\\d{1,5}(?!\\d)(?:\\s*,?\\s*${unidadRE}){0,2}`,
        'giud') },
    { tipo: 'domicilio', prioridad: 4, grupo: 1,                                            // domicilio en Mitre 123
      re: new RegExp(
        `${ANTES}(?:domicili(?:o|ad[oa])|reside|residente|sit[oa]|ubicad[oa]|vive)(?:\\s+(?:legal|real|constituido|especial|particular))*(?:\\s+en\\s+|\\s*:\\s*)([^,;.\\n]{3,60}?\\d{1,5}(?!\\d)(?:\\s*,?\\s*${unidadRE}){0,2})`,
        'giud') },

    // ---- Patentes argentinas: ABC123 (vieja) y AB123CD (Mercosur)
    { tipo: 'patente', prioridad: 4,
      re: /(?<![A-Za-z0-9])(?:[A-Z]{2} ?\d{3} ?[A-Z]{2}|[A-Z]{3} ?\d{3})(?![A-Za-z0-9])/gd,
      validar: (v) => !/^(DNI|CUIT|CUIL|CBU|CVU|LEY|ART|TEL|CEL|NRO|ISO|DEC|RES|EXP|ACTA)\d{3}$/.test(v.replace(/\s/g, '')) },

    // ---- Fechas
    { tipo: 'fecha', prioridad: 3,
      re: /(?<!\d)(?:0?[1-9]|[12]\d|3[01])[/.-](?:0?[1-9]|1[0-2])[/.-](?:19|20)\d{2}(?!\d)/gd },
    { tipo: 'fecha', prioridad: 3,
      re: /(?<!\d)\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+(?:19|20)\d{2}(?!\d)/giud },

    // ---- Nombres (4 estrategias, de más a menos segura)
    // (a) Con título delante: "Dr. Juan Pérez", "la señora María López"
    { tipo: 'nombre', prioridad: 5, grupo: 1, ajustar: recortarNombre,
      re: new RegExp(`${ANTES}${tituloRE}(${NOMBRE_COMPLETO})`, 'gud') },
    // (b) Con etiqueta: "Nombre: Juan Pérez", "Titular: GARCÍA, Ana"
    { tipo: 'nombre', prioridad: 5, grupo: 1, ajustar: recortarNombre,
      re: new RegExp(`${ANTES}${etiquetaRE}["']?\\s*:\\s*["']?(${NOMBRE_COMPLETO})`, 'gud') },
    // (c) "APELLIDO, Nombre" si el nombre de pila está en la lista
    { tipo: 'nombre', prioridad: 5,
      re: new RegExp(`${ANTES}\\p{Lu}{2,}(?: \\p{Lu}{2,})?,\\s*\\p{Lu}[\\p{Ll}'’-]+(?:\\s+\\p{Lu}[\\p{Ll}'’-]+)?${DESPUES}`, 'gud'),
      validar: (v) => SET_NOMBRES.has(sinTildes(v.split(',')[1].trim().split(/\s+/)[0]).toLowerCase()) },
    // (d) Nombre de pila conocido seguido de 1 a 3 palabras capitalizadas
    { tipo: 'nombre', prioridad: 5, ajustar: recortarNombre,
      re: new RegExp(`${ANTES}(?:${VARIANTES_NOMBRES})(?:\\s+(?:${NEXO}\\s+)*${PAL}){1,3}${DESPUES}`, 'gud'),
      validar: (v) => !TOPONIMOS.test(v) },
  ];

  /* -------------------------------------------------------------------
     5) DETECCIÓN POR ESTRUCTURA (CSV, JSON, XML)
     En un CSV, el encabezado dice qué es cada columna ("dni", "email"...).
     Es mucho más fiable que adivinar con regex: ocultamos la columna entera.
  ------------------------------------------------------------------- */
  const CLAVES = {
    nombre: ['nombre', 'nombres', 'apellido', 'apellidos', 'nombrecompleto', 'apellidoynombre',
      'nombreyapellido', 'titular', 'cliente', 'paciente', 'firmante', 'razonsocial'],
    dni: ['dni', 'documento', 'nrodocumento', 'numerodocumento', 'nrodni', 'numerodni'],
    cuit: ['cuit', 'cuil', 'cuitcuil'],
    email: ['email', 'mail', 'correo', 'correoelectronico', 'emailpersonal'],
    telefono: ['telefono', 'tel', 'celular', 'cel', 'movil', 'whatsapp', 'telefonocelular'],
    domicilio: ['domicilio', 'direccion', 'calle', 'domiciliolegal', 'domicilioreal'],
    cuenta: ['cbu', 'cvu', 'cuenta', 'nrocuenta', 'numerocuenta', 'iban', 'alias', 'aliascbu'],
    tarjeta: ['tarjeta', 'nrotarjeta', 'numerotarjeta'],
    patente: ['patente', 'dominio'],
    fecha: ['fechanacimiento', 'fechadenacimiento', 'nacimiento', 'fnac'],
  };

  function tipoPorClave(clave) {
    const k = sinTildes(clave).toLowerCase().replace(/[^a-z0-9]/g, '');
    return Object.keys(CLAVES).find((tipo) => CLAVES[tipo].includes(k)) || null;
  }

  // Recorta espacios y comillas de un rango [ini, fin) del texto
  function recortarRango(texto, ini, fin) {
    while (ini < fin && /[\s"]/.test(texto[ini])) ini++;
    while (fin > ini && /[\s"]/.test(texto[fin - 1])) fin--;
    return [ini, fin];
  }

  function detectarCSV(texto) {
    const primera = texto.split('\n', 1)[0];
    const delim = [',', ';', '\t', '|']
      .map((d) => [d, primera.split(d).length])
      .sort((a, b) => b[1] - a[1])[0][0];

    // Máquina de estados: recorre el texto y arma filas de celdas {ini, fin}
    const filas = [];
    let fila = [];
    let ini = 0;
    let enComillas = false;
    for (let i = 0; i <= texto.length; i++) {
      const c = texto[i];
      if (c === '"') { enComillas = !enComillas; continue; }
      if (i === texto.length || (!enComillas && (c === delim || c === '\n'))) {
        fila.push({ ini, fin: i });
        ini = i + 1;
        if (i === texto.length || c === '\n') { filas.push(fila); fila = []; }
      }
    }
    if (filas.length < 2) return [];

    const columnas = filas[0].map((celda) => tipoPorClave(texto.slice(celda.ini, celda.fin)));
    const hallazgos = [];
    for (let r = 1; r < filas.length; r++) {
      filas[r].forEach((celda, c) => {
        if (!columnas[c]) return;
        const [a, b] = recortarRango(texto, celda.ini, celda.fin);
        if (b > a) hallazgos.push({ tipo: columnas[c], inicio: a, fin: b, prioridad: 0 });
      });
    }
    return hallazgos;
  }

  function detectarJSON(texto) {
    const hallazgos = [];
    const re = /"([^"\\]+)"\s*:\s*("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?)/gd;
    for (const m of texto.matchAll(re)) {
      const tipo = tipoPorClave(m[1]);
      if (!tipo) continue;
      const [a, b] = m.indices[2];
      const entrecomillado = texto[a] === '"';
      const [ini, fin] = entrecomillado ? recortarRango(texto, a, b) : [a, b];
      if (fin > ini) {
        // Si era un número sin comillas, al reemplazar lo ponemos entre comillas
        // para que el JSON resultante siga siendo válido.
        hallazgos.push({ tipo, inicio: ini, fin, prioridad: 0, envolver: entrecomillado ? '' : '"' });
        // envolver '' (vacío) = ya estaba entre comillas: no hace falta agregarlas
      }
    }
    return hallazgos;
  }

  function detectarXML(texto) {
    const hallazgos = [];
    const re = /<([A-Za-z_][\w:.-]*)(?:\s[^>]*)?>([^<]+)<\/\1>/gd;
    for (const m of texto.matchAll(re)) {
      const tipo = tipoPorClave(m[1]);
      if (!tipo) continue;
      const [a, b] = recortarRango(texto, m.indices[2][0], m.indices[2][1]);
      if (b > a) hallazgos.push({ tipo, inicio: a, fin: b, prioridad: 0 });
    }
    return hallazgos;
  }

  /* -------------------------------------------------------------------
     6) DETECCIÓN GENERAL
  ------------------------------------------------------------------- */
  const escaparRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function detectar(texto, tiposActivos, extras, formato) {
    const candidatos = [];

    // 6.1 Por estructura (solo CSV/JSON/XML)
    const porEstructura =
      formato === 'csv' ? detectarCSV(texto) :
      formato === 'json' ? detectarJSON(texto) :
      formato === 'xml' ? detectarXML(texto) : [];
    porEstructura.forEach((h) => { if (tiposActivos.has(h.tipo)) candidatos.push(h); });

    // 6.2 Palabras personalizadas
    extras.forEach((palabra) => {
      const re = new RegExp(`${ANTES}${escaparRegExp(palabra)}${DESPUES}`, 'giu');
      for (const m of texto.matchAll(re)) {
        candidatos.push({ tipo: 'personalizado', inicio: m.index, fin: m.index + m[0].length, prioridad: 0 });
      }
    });

    // 6.3 Detectores por expresión regular
    DETECTORES.forEach((det) => {
      if (!tiposActivos.has(det.tipo)) return;
      det.re.lastIndex = 0;
      for (const m of texto.matchAll(det.re)) {
        const g = det.grupo || 0;
        if (m[g] === undefined) continue;
        let [inicio, fin] = m.indices[g];
        if (det.ajustar) {
          const ajustado = det.ajustar(m[g]);
          if (!ajustado) continue;
          fin = inicio + ajustado.length;
        }
        const valor = texto.slice(inicio, fin);
        if (det.validar && !det.validar(valor, texto, inicio, fin)) continue;
        candidatos.push({ tipo: det.tipo, inicio, fin, prioridad: det.prioridad });
      }
    });

    return candidatos;
  }

  /* Elige qué candidatos se quedan cuando se superponen:
     primero prioridad (menor gana), luego el más largo. */
  function resolverSuperposiciones(candidatos, largoTexto) {
    const ocupado = new Uint8Array(largoTexto);
    const ordenados = [...candidatos].sort(
      (a, b) => a.prioridad - b.prioridad || (b.fin - b.inicio) - (a.fin - a.inicio) || a.inicio - b.inicio
    );
    const aceptados = [];
    for (const c of ordenados) {
      let libre = true;
      for (let i = c.inicio; i < c.fin; i++) { if (ocupado[i]) { libre = false; break; } }
      if (!libre) continue;
      ocupado.fill(1, c.inicio, c.fin);
      aceptados.push(c);
    }
    return aceptados.sort((a, b) => a.inicio - b.inicio);
  }

  /* -------------------------------------------------------------------
     7) REEMPLAZO
  ------------------------------------------------------------------- */
  function normalizarValor(valor, tipo) {
    const base = sinTildes(valor).toLowerCase();
    return (tipo === 'nombre' || tipo === 'domicilio' || tipo === 'personalizado')
      ? base.replace(/\s+/g, ' ').trim()
      : base.replace(/[\s.\-/]/g, '');
  }

  // "4111 1111 1111 1111" -> "**** **** **** 1111"
  function enmascarar(valor, tipo) {
    const alnum = (valor.match(/[\p{L}\d]/gu) || []).length;
    const conservar = ['dni', 'cuit', 'telefono', 'cuenta', 'tarjeta'].includes(tipo)
      ? Math.min(4, Math.floor(alnum / 2)) : 0;
    const ocultar = alnum - conservar;
    let vistos = 0;
    return valor.replace(/[\p{L}\d]/gu, (c) => (vistos++ < ocultar ? '*' : c));
  }

  function anonimizar(texto, opciones = {}) {
    const tipos = new Set(opciones.tipos || Object.keys(TIPOS));
    const modo = opciones.modo || 'etiquetas';
    const extras = (opciones.extras || []).map((s) => s.trim()).filter(Boolean);
    const formato = opciones.formato || 'texto';

    const aceptados = resolverSuperposiciones(
      detectar(texto, tipos, extras, formato), texto.length
    );

    // Numeración consistente: el mismo valor recibe siempre la misma etiqueta
    const numeros = new Map();
    const contadores = {};
    const resumen = {};
    let resultado = '';
    let cursor = 0;

    const hallazgos = aceptados.map((h) => {
      const valor = texto.slice(h.inicio, h.fin);
      const clave = `${h.tipo}|${normalizarValor(valor, h.tipo)}`;
      if (!numeros.has(clave)) {
        contadores[h.tipo] = (contadores[h.tipo] || 0) + 1;
        numeros.set(clave, contadores[h.tipo]);
      }
      let reemplazo;
      if (modo === 'bloques') reemplazo = '████████';
      else if (modo === 'enmascarar') reemplazo = enmascarar(valor, h.tipo);
      else reemplazo = `[${TIPOS[h.tipo].tag}_${numeros.get(clave)}]`;

      // Número JSON sin comillas: lo envolvemos para que el JSON siga siendo válido
      if (h.envolver) reemplazo = h.envolver + reemplazo + h.envolver;
      resumen[h.tipo] = (resumen[h.tipo] || 0) + 1;

      resultado += texto.slice(cursor, h.inicio) + reemplazo;
      cursor = h.fin;
      return { tipo: h.tipo, inicio: h.inicio, fin: h.fin, valor, reemplazo };
    });
    resultado += texto.slice(cursor);

    return { resultado, hallazgos, resumen, total: hallazgos.length };
  }

  /* Parte el texto en trozos [{texto, tipo}] para poder resaltar los hallazgos
     en pantalla (usando <mark>) sin tocar innerHTML. */
  function segmentar(texto, hallazgos, limite = Infinity) {
    const corte = Math.min(texto.length, limite);
    const segmentos = [];
    let cursor = 0;
    for (const h of hallazgos) {
      if (h.fin > corte) break;
      if (h.inicio > cursor) segmentos.push({ texto: texto.slice(cursor, h.inicio), tipo: null });
      segmentos.push({ texto: texto.slice(h.inicio, h.fin), tipo: h.tipo });
      cursor = h.fin;
    }
    if (cursor < corte) segmentos.push({ texto: texto.slice(cursor, corte), tipo: null });
    return segmentos;
  }

  return { TIPOS, anonimizar, segmentar, luhn, tipoPorClave };
})();

// Si se ejecuta en Node (tests) exportamos el objeto; en el navegador no pasa nada.
if (typeof module !== 'undefined' && module.exports) module.exports = Anonimax;
