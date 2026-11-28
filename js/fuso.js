/** Fuso horário oficial do app: America/Sao_Paulo (sem horário de verão desde 2019). */
export const FUSO_APP = 'America/Sao_Paulo';

/**
 * Partes de calendário (ano, mês 1–12, dia) de uma data instantânea no fuso do app.
 * @param {Date} [instant]
 */
export function partesDataSaoPaulo(instant = new Date()) {
  const partes = {};
  for (const item of new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO_APP,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(instant)) {
    if (item.type === 'year') partes.year = Number(item.value);
    if (item.type === 'month') partes.month = Number(item.value);
    if (item.type === 'day') partes.day = Number(item.value);
  }
  return partes;
}

/** Chave de mês dos gastos fixos, no formato já usado no Firestore: 'ano-mês' (ex.: 2026-11). */
export function chaveMes(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function chaveMesDeInstant(instant = new Date()) {
  const { year, month } = partesDataSaoPaulo(instant);
  return chaveMes(year, month);
}

export function dataIsoSaoPaulo(instant = new Date()) {
  const { year, month, day } = partesDataSaoPaulo(instant);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function ehChaveMes(chave) {
  return typeof chave === 'string' && /^\d{4}-\d{2}$/.test(chave);
}

/** Soma um deslocamento de meses ao par ano/mês (mês no intervalo 1–12). */
export function somarMeses(year, month, delta) {
  const indice = year * 12 + (month - 1) + delta;
  const y = Math.floor(indice / 12);
  const m = indice - y * 12 + 1;
  return { year: y, month: m };
}

export function formatarMesAno(year, month) {
  const ancora = new Date(Date.UTC(year, month - 1, 15, 15, 0, 0));
  const formatted = ancora.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: FUSO_APP,
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
