export type Locale = 'es' | 'en';
export type Period = 'day' | 'week' | 'month' | 'year';
export type AnalyticsScope = {tab:'operations'|'owner';period:Period;date:string;lang:Locale;startDate?:string;endDate?:string};
export type Currency = 'MXN'|'USD';
export type Receipt = {orderId:string;ticket:string;totalCents:number;status:string;paidAt:string;currency?:Currency};
export type QueueOrder = {id:string;ticket:string;status:string;paidAt:string;totalCents:number;currency:Currency};
export type Shift = {id:string;currency:Currency;floatCents:number;receiptsCents:number;dropsCents:number;expectedCents:number;tenderedCents?:number;changeCents?:number;orderCount?:number};
export type Audit = {id:string;currency:Currency;closedAt:string;expectedCents:number;actualCents:number;varianceCents:number};
export type AnalyticsDTO = {scope:AnalyticsScope;revision:number;observedAt:string;currency:Currency;timezone:string;summaryAvailable:boolean;taxConfigured?:boolean;taxBasisPoints?:number;currencyTotals?:{currency:Currency;receiptsCents:number;ticketCount:number}[];quality:{excludedReceipts:number;[key:string]:unknown};sales:{receiptsCents:number;subtotalCents:number;taxCents:number;ticketCount:number;averageCents:number|null;buckets:{label:string;date:string;receiptsCents:number;ticketCount:number}[];topItems:{menuItemId?:string;name:string;quantity:number;receiptsCents?:number}[];recentReceipts:Receipt[]};operations:{activeCount:number;oldestAgeMinutes:number|null;medianPickupMinutes:number|null;completedSampleCount:number;counts:{pending:number;preparing:number;ready:number};activeOrders:QueueOrder[];currentShift:Shift|null;latestAudit:Audit|null;drawerExceptions:{status:string;paymentId:string|null;at?:string}[]};metricDefinitions?:unknown;evidenceFlow?:unknown};
const object = (value:unknown):Record<string,any> => {if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error('Invalid analytics response');return value as Record<string,any>;};
const num = (v:unknown, nullable=false) => {if (nullable && v===null) return; if (typeof v!=='number' || !Number.isFinite(v)) throw new Error('Invalid analytics measure');};
const integer=(v:unknown,signed=false)=>{num(v);if(!Number.isSafeInteger(v)||(!signed&&(v as number)<0))throw new Error('Invalid analytics integer');};
const str = (v:unknown) => {if(typeof v!=='string') throw new Error('Invalid analytics label');};
const currency = (v:unknown) => {if(v!=='MXN' && v!=='USD') throw new Error('Invalid analytics currency');};
const list = (v:unknown, fields:string[], numbers:string[]) => {if(!Array.isArray(v)) throw new Error('Invalid analytics rows');v.forEach(item=>{const row=object(item);fields.forEach(key=>str(row[key]));numbers.forEach(key=>integer(row[key]));});};
export function decodeAnalytics(value:unknown):AnalyticsDTO {
 const dto=object(value), s=object(dto.sales), o=object(dto.operations), q=object(dto.quality), scope=object(dto.scope);
 num(dto.revision);if(!Number.isSafeInteger(dto.revision)||dto.revision<0) throw new Error('Invalid revision');str(dto.observedAt);if(!Number.isFinite(Date.parse(dto.observedAt))) throw new Error('Invalid observation time');currency(dto.currency);str(dto.timezone ?? dto.timeZone);dto.timezone=dto.timezone ?? dto.timeZone;
 if(typeof dto.summaryAvailable!=='boolean') throw new Error('Invalid summary availability');integer(q.excludedReceipts);for(const key of ['invalidCompletionTimes','invalidAudits'])if(q[key]!==undefined)integer(q[key]);
 if(!['operations','owner'].includes(scope.tab)||!['day','week','month','year'].includes(scope.period)||!['es','en'].includes(scope.lang)||!validDate(scope.date)) throw new Error('Invalid analytics scope');
 ['receiptsCents','subtotalCents','taxCents','ticketCount'].forEach(k=>integer(s[k]));num(s.averageCents,true);
 list(s.buckets,['label','date'],['receiptsCents','ticketCount']);list(s.topItems,['name'],['quantity']);list(s.recentReceipts,['orderId','ticket','status','paidAt'],['totalCents']);
 ['activeCount','completedSampleCount'].forEach(k=>integer(o[k]));num(o.oldestAgeMinutes,true);num(o.medianPickupMinutes,true);const counts=object(o.counts);['pending','preparing','ready'].forEach(k=>integer(counts[k]));
 list(o.activeOrders,['id','ticket','status','paidAt'],['totalCents']);o.activeOrders.forEach((r:any)=>currency(r.currency));list(o.drawerExceptions,['status'],[]);o.drawerExceptions.forEach((r:any)=>{if(r.paymentId!==null)str(r.paymentId);});
 if(o.currentShift!==null){const r=object(o.currentShift);str(r.id);currency(r.currency);['floatCents','receiptsCents','dropsCents','expectedCents'].forEach(k=>integer(r[k]));}
 if(o.latestAudit!==null){const r=object(o.latestAudit);str(r.id);str(r.closedAt);currency(r.currency);['expectedCents','actualCents'].forEach(k=>integer(r[k]));integer(r.varianceCents,true);}
 if(dto.currencyTotals!==undefined){list(dto.currencyTotals,[],['receiptsCents','ticketCount']);dto.currencyTotals.forEach((r:any)=>currency(r.currency));}
 return dto as AnalyticsDTO;
}
export function validDate(v:unknown):v is string {return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;}
export function today():string {return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function parseScope(href:string):AnalyticsScope {const u=new URL(href);let saved='es';try{saved=localStorage.getItem('masaflow.locale')||'es';}catch{}const tab=u.searchParams.get('tab')||u.searchParams.get('view');return {tab:tab==='owner'||tab==='sales'?'owner':'operations',period:['day','week','month','year'].includes(u.searchParams.get('period')||'')?u.searchParams.get('period') as Period:'day',date:validDate(u.searchParams.get('date'))?u.searchParams.get('date')!:today(),lang:(u.searchParams.get('lang')||saved)==='en'?'en':'es'};}
export function queryScope(scope:AnalyticsScope):string {return new URLSearchParams({tab:scope.tab,period:scope.period,date:scope.date,lang:scope.lang}).toString();}
export function moveDate(scope:AnalyticsScope,delta:number):string {const date=new Date(scope.date+'T12:00:00Z');if(scope.period==='year')date.setUTCFullYear(date.getUTCFullYear()+delta);else if(scope.period==='month'){date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+delta);}else date.setUTCDate(date.getUTCDate()+delta*(scope.period==='week'?7:1));return date.toISOString().slice(0,10);}
