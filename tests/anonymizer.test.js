/* Pruebas del motor de anonimización.
   Ejecutar con:  node tests/anonymizer.test.js
   No necesita instalar nada: usa el módulo "assert" que ya trae Node. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Anonimax = require('../js/anonymizer.js');

let pasaron = 0;
function prueba(nombre, fn) {
  try { fn(); pasaron++; console.log('  ✔', nombre); }
  catch (e) { console.error('  ✘', nombre, '\n   ', e.message); process.exitCode = 1; }
}
const anon = (t, o) => Anonimax.anonimizar(t, o);
const tiposEn = (t, o) => Object.keys(anon(t, o).resumen).sort();

console.log('Detección por tipo');
prueba('email', () => assert.equal(anon('Escribir a ana.lopez@mail.com ya', { tipos: ['email'] }).resultado, 'Escribir a [EMAIL_1] ya'));
prueba('DNI con puntos y con etiqueta', () => {
  assert.equal(anon('DNI 12.345.678 y DNI: 23456789', { tipos: ['dni'] }).resultado, 'DNI [DNI_1] y DNI: [DNI_2]');
});
prueba('DNI no confunde dinero', () => assert.equal(anon('Total $ 12.345.678,50', { tipos: ['dni'] }).total, 0));
prueba('CUIT gana sobre DNI (prioridad)', () => {
  const r = anon('CUIT 20-12345678-9', { tipos: ['cuit', 'dni'] });
  assert.equal(r.resultado, 'CUIT [CUIT_1]');
});
prueba('CBU de 22 dígitos', () => assert.equal(anon('CBU 0170099520000012345678.', { tipos: ['cuenta'] }).resultado, 'CBU [CUENTA_1].'));
prueba('alias CBU', () => assert.equal(anon('alias: juan.perez.alq', { tipos: ['cuenta'] }).resultado, 'alias: [CUENTA_1]'));
prueba('tarjeta válida (Luhn) sí, número cualquiera no', () => {
  assert.equal(anon('4111 1111 1111 1111', { tipos: ['tarjeta'] }).total, 1);
  assert.equal(anon('1234 5678 9012 3456', { tipos: ['tarjeta'] }).total, 0);
});
prueba('teléfonos argentinos', () => {
  const r = anon('+54 9 351 555-1234, 11 5555-1234, (0351) 15 555-1234, Tel: 4555-6789', { tipos: ['telefono'] });
  assert.equal(r.total, 4);
});
prueba('domicilio con calle y con "domicilio en"', () => {
  assert.equal(anon('vive en Av. Colón 1234, piso 5 dpto B.', { tipos: ['domicilio'] }).resultado.includes('1234'), false);
  assert.equal(anon('con domicilio en Mitre 321, Rosario', { tipos: ['domicilio'] }).resultado, 'con domicilio en [DOMICILIO_1], Rosario');
});
prueba('patente nueva y vieja, pero no "DNI 123"', () => {
  assert.equal(anon('AB123CD y ABC 123', { tipos: ['patente'] }).total, 2);
  assert.equal(anon('DNI 123', { tipos: ['patente'] }).total, 0);
});
prueba('fechas numéricas y escritas', () => assert.equal(anon('04/07/1985 y 15 de marzo de 2026', { tipos: ['fecha'] }).total, 2));

console.log('Nombres');
prueba('con título', () => assert.equal(anon('Firmó el Sr. Juan Carlos Pérez ayer.', { tipos: ['nombre'] }).resultado, 'Firmó el Sr. [NOMBRE_1] ayer.'));
prueba('con nombre compuesto con conector', () => assert.equal(anon('la señora María de los Ángeles González firmó', { tipos: ['nombre'] }).resultado, 'la señora [NOMBRE_1] firmó'));
prueba('con etiqueta y APELLIDO, Nombre', () => {
  assert.equal(anon('Titular: GARCÍA, Ana Laura', { tipos: ['nombre'] }).resultado, 'Titular: [NOMBRE_1]');
});
prueba('nombre de pila conocido sin título', () => assert.equal(anon('Se reunió con Lucía Fernández hoy', { tipos: ['nombre'] }).resultado, 'Se reunió con [NOMBRE_1] hoy'));
prueba('no toca "Santiago del Estero"', () => assert.equal(anon('Viajó a Santiago del Estero', { tipos: ['nombre'] }).total, 0));
prueba('no se lleva "DNI" pegado al nombre', () => assert.equal(anon('Titular: Juan Pérez DNI 123', { tipos: ['nombre'] }).resultado, 'Titular: [NOMBRE_1] DNI 123'));
prueba('palabras personalizadas', () => assert.equal(anon('Trabaja en Acme Corp.', { tipos: [], extras: ['acme corp'] }).resultado, 'Trabaja en [DATO_1].'));

console.log('Modos y consistencia');
prueba('mismo valor = misma etiqueta', () => assert.equal(anon('a@x.com b@x.com a@x.com', { tipos: ['email'] }).resultado, '[EMAIL_1] [EMAIL_2] [EMAIL_1]'));
prueba('modo bloques', () => assert.equal(anon('a@x.com', { tipos: ['email'], modo: 'bloques' }).resultado, '████████'));
prueba('modo enmascarar conserva los últimos 4 de la tarjeta', () => assert.equal(anon('4111 1111 1111 1111', { tipos: ['tarjeta'], modo: 'enmascarar' }).resultado, '**** **** **** 1111'));
prueba('solo oculta los tipos elegidos', () => assert.deepEqual(tiposEn('a@x.com DNI 12.345.678', { tipos: ['email'] }), ['email']));

console.log('Formatos estructurados');
prueba('CSV: oculta columnas por encabezado', () => {
  const r = anon('nombre,dni,nota\nAna,30123456,ok\nLuis,28987654,ok', { formato: 'csv' });
  assert.equal(r.resultado, 'nombre,dni,nota\n[NOMBRE_1],[DNI_1],ok\n[NOMBRE_2],[DNI_2],ok');
});
prueba('JSON: sigue siendo JSON válido (incluso con DNI numérico)', () => {
  const r = anon('{"nombre":"Ana Paz","dni":30123456,"ok":true}', { formato: 'json' });
  assert.doesNotThrow(() => JSON.parse(r.resultado));
  assert.equal(JSON.parse(r.resultado).dni, '[DNI_1]');
});
prueba('XML: oculta contenido de etiquetas', () => {
  assert.equal(anon('<p><email>a@x.com</email><dni>123</dni></p>', { formato: 'xml', tipos: ['email', 'dni'] }).resultado,
    '<p><email>[EMAIL_1]</email><dni>[DNI_1]</dni></p>');
});

console.log('Archivos de muestra');
const muestra = (f) => fs.readFileSync(path.join(__dirname, '..', 'muestras', f), 'utf8');
prueba('ejemplo.txt: ningún dato sensible queda en el resultado', () => {
  const r = anon(muestra('ejemplo.txt'), {}).resultado;
  ['Pérez', '12.345.678', '20-12345678-9', 'Colón 1234', 'González', '27.654.321', 'San Martín 456', 'Illia 789',
    '0170099520000012345678', 'juan.perez@', 'maria.gonzalez@', '555-1234', 'GARCÍA', '4111', 'AB123CD',
    '04/07/1985', 'Sánchez', '4555-6789'].forEach((s) => assert.equal(r.includes(s), false, `quedó "${s}"`));
  assert.equal(r.includes('$ 450.000,00'), true, 'el monto no debería ocultarse');
});
prueba('ejemplo.csv y ejemplo.json', () => {
  const csv = anon(muestra('ejemplo.csv'), { formato: 'csv' }).resultado;
  ['Fernández', '30123456', 'ejemplo.com', 'Rivadavia', '0110012340000012345678'].forEach((s) => assert.equal(csv.includes(s), false, `CSV: quedó "${s}"`));
  const js = anon(muestra('ejemplo.json'), { formato: 'json' }).resultado;
  assert.doesNotThrow(() => JSON.parse(js));
  ['Benítez', '31456789', 'Mitre', 'AC456DE', 'Acosta', '10/11/2026'].forEach((s) => assert.equal(js.includes(s), false, `JSON: quedó "${s}"`));
});

console.log(`\n${pasaron} pruebas pasaron${process.exitCode ? ' — HAY FALLAS' : ' ✔'}`);

console.log('Regresiones');
prueba('un teléfono +54 de 13 dígitos no se confunde con tarjeta', () => {
  const r = anon('Llamar al +54 9 351 555-1234', {});
  assert.equal(r.resumen.tarjeta, undefined);
  assert.equal(r.resumen.telefono, 1);
});
prueba('tarjeta Amex 4-6-5 válida', () => assert.equal(anon('3782 822463 10005', { tipos: ['tarjeta'] }).total, 1));
