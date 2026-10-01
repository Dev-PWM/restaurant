import catalog from '../../../../../assets/masaflow-catalog.json';
export function tChrome(text){
  const locale=globalThis.document?.documentElement.lang==='es'?'es':'en';
  return catalog.html[locale]?.[text]||text;
}
