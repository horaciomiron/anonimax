/* main.js — comportamiento común a todas las páginas
   1) Menú hamburguesa (celular)
   2) Botón de modo claro / oscuro
   3) Año del pie de página
   4) Validación del formulario de la portada
   El archivo se carga con "defer": se ejecuta cuando el HTML ya está leído. */
(() => {
  'use strict';

  /* ---------- 1) MENÚ HAMBURGUESA ---------- */
  const botonMenu = document.querySelector('#menu-toggle');
  const menu = document.querySelector('#menu-principal');

  function abrirMenu(abrir) {
    menu.classList.toggle('is-open', abrir);
    botonMenu.setAttribute('aria-expanded', String(abrir));            // lo lee el lector de pantalla
    botonMenu.querySelector('.visually-hidden').textContent = abrir ? 'Cerrar menú' : 'Abrir menú';
  }

  if (botonMenu && menu) {
    botonMenu.addEventListener('click', () => {
      abrirMenu(botonMenu.getAttribute('aria-expanded') !== 'true');
    });
    // Escape cierra el menú y devuelve el foco al botón (buena práctica de accesibilidad)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) {
        abrirMenu(false);
        botonMenu.focus();
      }
    });
    // Al tocar un enlace del menú, se cierra
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) abrirMenu(false); });
  }

  /* ---------- 2) MODO CLARO / OSCURO ---------- */
  const botonTema = document.querySelector('#theme-toggle');
  const raiz = document.documentElement;

  function actualizarBotonTema() {
    const esClaro = raiz.getAttribute('data-theme') === 'light';
    botonTema.textContent = esClaro ? 'Modo oscuro' : 'Modo claro';
    botonTema.setAttribute('aria-label', esClaro ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  }

  if (botonTema) {
    actualizarBotonTema();
    botonTema.addEventListener('click', () => {
      const nuevo = raiz.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      raiz.setAttribute('data-theme', nuevo);     // el CSS cambia solo, porque usa variables
      try { localStorage.setItem('anonimax-tema', nuevo); } catch (e) { /* sin almacenamiento: no pasa nada */ }
      actualizarBotonTema();
    });
  }

  /* ---------- 3) AÑO DEL PIE ---------- */
  const anio = document.querySelector('#anio');
  if (anio) anio.textContent = new Date().getFullYear();

  /* ---------- 4) VALIDACIÓN DEL FORMULARIO DE LA PORTADA ---------- */
  const form = document.querySelector('#form-acceso');
  if (!form) return;

  // Mostrar u ocultar el error de un campo, de forma accesible
  function marcar(campo, mensaje) {
    const error = document.querySelector(`#error-${campo.id}`);
    error.textContent = mensaje;
    if (mensaje) campo.setAttribute('aria-invalid', 'true');
    else campo.removeAttribute('aria-invalid');
    return !mensaje;
  }

  // Cada función devuelve un mensaje de error, o '' si el campo está bien
  const reglas = {
    email: (campo) => {
      const valor = campo.value.trim();
      if (!valor) return 'Ingresá tu correo electrónico.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor)) return 'El correo no parece válido. Ejemplo: nombre@dominio.com';
      return '';
    },
    perfil: (campo) => (campo.value ? '' : 'Elegí una opción de la lista.'),
    volumen: (campo) => {
      if (campo.value === '') return '';                       // es opcional
      const n = Number(campo.value);
      if (!Number.isInteger(n) || n < 1 || n > 100000) return 'Ingresá un número entero entre 1 y 100.000.';
      return '';
    },
    fecha: (campo) => {
      if (!campo.value) return '';                             // es opcional
      const hoy = new Date().toISOString().slice(0, 10);       // "2026-10-19"
      return campo.value < hoy ? 'La fecha no puede ser anterior a hoy.' : '';
    },
    acepto: (campo) => (campo.checked ? '' : 'Tenés que aceptar para continuar.'),
  };

  // Validación en vivo: al salir de un campo ("blur") se revisa solo ese campo
  Object.keys(reglas).forEach((id) => {
    const campo = form.elements[id];
    campo.addEventListener('blur', () => marcar(campo, reglas[id](campo)));
    campo.addEventListener('input', () => { if (campo.hasAttribute('aria-invalid')) marcar(campo, reglas[id](campo)); });
  });

  form.addEventListener('submit', (evento) => {
    evento.preventDefault();                                   // evita que la página se recargue
    const salida = document.querySelector('#resultado-acceso');
    salida.hidden = true;

    let primerError = null;
    Object.keys(reglas).forEach((id) => {
      const campo = form.elements[id];
      const ok = marcar(campo, reglas[id](campo));
      if (!ok && !primerError) primerError = campo;
    });

    if (primerError) { primerError.focus(); return; }          // llevamos el foco al primer error

    salida.textContent = '¡Listo! Te anotamos para avisarte. (Demo académica: no se envió ningún dato.)';
    salida.hidden = false;
    form.reset();
  });
})();
