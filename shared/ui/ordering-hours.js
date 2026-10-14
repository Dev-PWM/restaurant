'use strict';
/** @param {NonNullable<import('../types/realtime').Snapshot['orderingHours']>} hours */
function orderingHoursText(hours) {
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const selected = [...new Set(hours.days)].sort((a, b) => a - b);
  const contiguous = selected.length > 1 && selected.every((day, index) => day === selected[0] + index);
  const dayLabel = contiguous
    ? `de ${days[selected[0]]} a ${days[selected.at(-1)]}`
    : `los ${new Intl.ListFormat('es-MX', { type: 'conjunction' }).format(selected.map(day => days[day]))}`;
  const time = (/** @type {string} */ value) => new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).format(new Date(`2000-01-01T${value}:00Z`));
  const end = time(hours.end);
  return {
    hours: `Te esperamos ${dayLabel}, de ${time(hours.start)} a ${end}${end.endsWith('.') ? '' : '.'}`,
    zone: hours.timeZone === 'America/Mexico_City' ? 'Hora de Ciudad de México.' : `Hora de ${hours.timeZone.split('/').at(-1).replaceAll('_', ' ')}.`,
  };
}
module.exports = { orderingHoursText };
