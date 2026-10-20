/* theme.js — se carga en el <head>, ANTES de que el navegador dibuje la página.
   Hace dos cosas:
   1) Marca <html class="js">: así el CSS sabe que hay JavaScript y puede
      ocultar el menú en celular (mejora progresiva).
   2) Aplica el tema guardado (claro/oscuro) para que no haya "parpadeo". */
(() => {
  'use strict';
  const raiz = document.documentElement;
  raiz.classList.add('js');

  let tema = 'dark'; // el prototipo de Figma es oscuro
  try {
    // localStorage puede fallar (modo privado, cookies bloqueadas): por eso va en try/catch
    tema = localStorage.getItem('anonimax-tema') || tema;
  } catch (e) { /* si falla, usamos el tema por defecto */ }

  raiz.setAttribute('data-theme', tema);
})();
