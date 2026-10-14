'use strict';
/** @typedef {{timeZone: string, days: number[], start: string, end: string}} Schedule */
/** @param {Schedule} schedule */
function validateSchedule(schedule) {
  if (!schedule || typeof schedule.timeZone !== 'string') throw new Error('Set a valid timeZone.');
  new Intl.DateTimeFormat('en', { timeZone: schedule.timeZone }).format();
  if (!Array.isArray(schedule.days) || !schedule.days.length || schedule.days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('days must contain weekday numbers from 0 (Sunday) to 6 (Saturday).');
  const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (!validTime(schedule.start) || !validTime(schedule.end) || schedule.start >= schedule.end) throw new Error('Use HH:MM times with start before end on the same day.');
  return schedule;
}
/** @param {Schedule} schedule @param {Date} [date] */
function isOpen(schedule, date = new Date()) {
  validateSchedule(schedule);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: schedule.timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(part => [part.type, part.value]));
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const time = `${parts.hour}:${parts.minute}`;
  return schedule.days.includes(day) && time >= schedule.start && time < schedule.end;
}
module.exports = { validateSchedule, isOpen };
