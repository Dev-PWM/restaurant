// @ts-check
"use strict";

/**
 * One entry per control on the POS. The walkthrough, the «¿Qué hace?» explore mode
 * and the cheat sheet all read from here, so what a button is taught to do can never
 * drift from what it is described as doing elsewhere. Every sentence below was
 * checked against the real behaviour of the app (server, POS and customer screens).
 *
 * @typedef {Object} GlossaryEntry
 * @property {string} id
 * @property {string} label    The text staff see on the control.
 * @property {string} group    Where it lives, for the cheat sheet.
 * @property {string} purpose  ¿Para qué sirve?
 * @property {string} effect   ¿Qué pasa en el sistema?
 * @property {string} why      ¿Por qué importa?
 * @property {string} [watch]  Cuidado.
 */

/** @type {GlossaryEntry[]} */
export const GLOSSARY = [
  {
    id: "lane-review",
    label: "Fila 1 · En revisión",
    group: "Tablero",
    purpose:
      "Aquí llegan los pedidos nuevos que los clientes mandan desde su teléfono.",
    effect:
      "El cliente ve «En revisión por el negocio». Nada se cocina hasta que tú lo aceptes.",
    why: "Tú decides cuándo empieza la cocina, así ningún pedido se pierde ni se cocina por error.",
  },
  {
    id: "lane-cooking",
    label: "Fila 2 · Cocinando",
    group: "Tablero",
    purpose: "Aquí están los pedidos que ya aceptaste y se están preparando.",
    effect: "El cliente ve «Paso 2: Manos a la Masa».",
    why: "Todo el equipo ve de un vistazo qué hay en el comal.",
  },
  {
    id: "lane-ready",
    label: "Fila 3 · Lista para recoger",
    group: "Tablero",
    purpose:
      "Aquí esperan los pedidos terminados hasta que el cliente llega por ellos. Aquí es donde se cobra.",
    effect: "El cliente ve «¡Tu pedido está listo!».",
    why: "El cobro es siempre al entregar: nada sale sin cobrarse.",
  },
  {
    id: "ticket",
    label: "Ticket (comanda)",
    group: "Tablero",
    purpose:
      "Arriba va el número y el nombre del cliente; en medio los platillos con sus etiquetas; abajo la hora y el total.",
    effect:
      "Etiqueta ROJA = ingrediente que se quita (SIN queso). Etiqueta VERDE = extra que se agrega.",
    why: "Leer las etiquetas antes de cocinar evita devoluciones y problemas con alergias.",
  },
  {
    id: "timer",
    label: "Reloj del ticket",
    group: "Tablero",
    purpose: "Cuenta cuánto lleva esperando el pedido.",
    effect:
      "En revisión se pone ámbar a los 2 minutos y rojo («Demorado») a los 3. En cocina, ámbar a los 5 minutos y rojo a los 15.",
    why: "Atiende primero lo que está en rojo: son los clientes que más llevan esperando.",
  },
  {
    id: "accept",
    label: "Aceptar y empezar a cocinar",
    group: "Ticket",
    purpose: "Confirma que la cocina tomó el pedido.",
    effect:
      "El ticket pasa a «Cocinando» y la pantalla del cliente cambia al instante a «Paso 2: Manos a la Masa».",
    why: "El cliente sabe que su pedido ya empezó y la cocina sabe qué preparar.",
    watch: "No se puede regresar: acepta solo cuando de verdad vas a cocinar.",
  },
  {
    id: "ready",
    label: "Marcar lista para recoger",
    group: "Ticket",
    purpose: "Avisa que la comida ya está terminada.",
    effect:
      "El ticket pasa a «Lista para recoger». Al cliente le aparece «¡Tu pedido está listo!» con timbre y vibración si tiene la pantalla abierta.",
    why: "El cliente se acerca sin que tengas que gritar nombres y la comida llega caliente.",
    watch: "No se puede regresar: márcala lista cuando ya esté lista.",
  },
  {
    id: "pay",
    label: "Cobrar al entregar",
    group: "Ticket",
    purpose: "Abre la ventana de cobro de ese pedido.",
    effect:
      "Muestra el total a cobrar, el efectivo recibido y el cambio. Todavía no registra ningún pago.",
    why: "Cobrar siempre al entregar evita comida sin pagar.",
  },
  {
    id: "noshow",
    label: "Anular pedido / No-Show",
    group: "Ticket",
    purpose:
      "Se usa cuando un cliente nunca llegó por su pedido (o se canceló).",
    effect:
      "Abre una confirmación. Al confirmar, el pedido sale de la fila y queda en el historial como No-Show, sin dinero registrado. El cliente ve «Pedido cancelado / No-Show».",
    why: "Limpia la pantalla de tickets que nadie va a recoger sin inventar una venta.",
  },
  {
    id: "noshow-confirm",
    label: "Confirmar No-Show",
    group: "Ticket",
    purpose: "Confirma la anulación.",
    effect:
      "El pedido se quita de la fila y se guarda como No-Show. No suma a las ventas.",
    why: "Los No-Show quedan guardados para que se pueda revisar qué pasó.",
    watch: "Un No-Show no se puede cobrar después.",
  },
  {
    id: "tender-preset",
    label: "Billetes $100 · $200 · $500",
    group: "Ventana de cobro",
    purpose: "Anotan de un toque cuánto efectivo te dio el cliente.",
    effect: "El sistema calcula el cambio al instante («Cambio a entregar»).",
    why: "No calcules en tu mente: lee el cambio en pantalla y evita descuadres.",
    watch: "Toca el billete que realmente te dieron, no el que esperabas.",
  },
  {
    id: "cash-input",
    label: "Efectivo recibido (MXN)",
    group: "Ventana de cobro",
    purpose:
      "Aquí escribes la cantidad exacta cuando el cliente paga con un monto que no es $100, $200 o $500.",
    effect:
      "Muestra «Cambio a entregar» si alcanza, o «Falta por recibir» si no alcanza.",
    why: "Cobrar de menos por error cuesta dinero; el sistema te avisa antes.",
  },
  {
    id: "cash-change",
    label: "Cambio a entregar / Falta por recibir",
    group: "Ventana de cobro",
    purpose: "Te dice cuánto devolver o cuánto falta.",
    effect:
      "Si falta dinero, el botón «Confirmar pago y entregar» se apaga: el sistema no te deja cobrar de menos.",
    why: "Es tu red de seguridad al cobrar.",
  },
  {
    id: "exact",
    label: "Exacto",
    group: "Ventana de cobro",
    purpose:
      "Escribe por ti el total exacto del pedido en «Efectivo recibido».",
    effect: "El cambio queda en $0.00.",
    why: "Para clientes que pagan justo.",
  },
  {
    id: "confirm-payment",
    label: "Confirmar pago y entregar",
    group: "Ventana de cobro",
    purpose: "Asienta el cobro con el efectivo que anotaste.",
    effect:
      "El pago queda en espera 5 segundos (en ese tiempo «Deshacer» lo cancela). Después se suma a «Ventas cobradas» y el pedido pasa a Completados.",
    why: "Una venta bien registrada es una caja que cuadra al final del turno.",
    watch: "Confirma solo después de tener el efectivo en la mano.",
  },
  {
    id: "exact-pay",
    label: "Efectivo exacto · Cobrar y entregar",
    group: "Ventana de cobro",
    purpose: "Cobra el total exacto de un solo toque.",
    effect:
      "Registra el pago por el total del pedido, sin cambio, con los mismos 5 segundos para deshacer.",
    why: "Más rápido cuando el cliente paga justo.",
  },
  {
    id: "undo",
    label: "Deshacer",
    group: "Ticket",
    purpose: "Cancela un cobro que acabas de confirmar.",
    effect:
      "Durante los 5 segundos de espera detiene el cobro y el pedido vuelve a «Cobrar al entregar». Pasados los 5 segundos ya no se puede.",
    why: "Corrige un billete mal tocado antes de que llegue a la caja.",
    watch: "Son solo 5 segundos: si te equivocaste, tócalo de inmediato.",
  },
  {
    id: "inventory",
    label: "Inventario",
    group: "Encabezado",
    purpose: "Aquí apagas un platillo cuando se acaba el ingrediente.",
    effect: "Los cambios aparecen al instante en el menú de tus clientes.",
    why: "Evita que los clientes pidan lo que no puedes cocinar.",
  },
  {
    id: "inventory-toggle",
    label: "Interruptor Disponible / Agotado",
    group: "Inventario",
    purpose: "Enciende o apaga un platillo.",
    effect:
      "Apagado: el cliente lo ve como «Agotado» y no puede agregarlo. Se aplica en cuanto lo tocas; no hay botón de guardar.",
    why: "Es la forma más rápida de cortar un platillo («86») durante la hora pico.",
  },
  {
    id: "pause-web",
    label: "Pausar / Reanudar pedidos web",
    group: "Encabezado",
    purpose:
      "Es el botón de pánico: detiene los pedidos nuevos desde los teléfonos.",
    effect:
      "Los clientes ven «Pedidos por internet pausados.» y «Puedes ordenar directamente en el mostrador. Tus pedidos existentes siguen en curso.»",
    why: "Le da un respiro a la cocina sin cancelar los pedidos que ya estaban hechos.",
    watch: "No te olvides de reanudarlos cuando se calme la cocina.",
  },
  {
    id: "kitchen-mode",
    label: "Modo Cocina",
    group: "Tablero",
    purpose:
      "Oculta la fila «En revisión» para dejar solo lo que se está cocinando y lo que está listo.",
    effect: "Solo cambia lo que ves. No modifica ningún pedido.",
    why: "La pantalla de la cocina queda más limpia.",
  },
  {
    id: "comal-summary",
    label: "En el comal ahora",
    group: "Tablero",
    purpose:
      "Suma las piezas de todos los pedidos que están en «Cocinando», por platillo.",
    effect:
      "Se actualiza solo: baja cuando marcas pedidos como listos y sube cuando aceptas nuevos.",
    why: "Te dice cuántas piezas de cada platillo poner al comal juntas.",
  },
  {
    id: "tab-queue",
    label: "Pedidos en Fila",
    group: "Tablero",
    purpose: "Muestra los pedidos que todavía no se entregan.",
    effect: "El número es cuántos hay en fila ahora.",
    why: "Es la pantalla de trabajo del turno.",
  },
  {
    id: "tab-tables",
    label: "Control de Mesas",
    group: "Mesas",
    purpose:
      "Muestra las mesas del comedor y cuántas están ocupadas, por ejemplo 1/3.",
    effect:
      "Es la misma lista que ven los clientes: cuando eligen «Comer aquí» ven cuántas mesas hay libres, al instante.",
    why: "Así nadie pide comer aquí cuando el comedor está lleno.",
  },
  {
    id: "table-card",
    label: "Mesa",
    group: "Mesas",
    purpose:
      "Cada tarjeta es una mesa. Tócala cuando sientes a alguien y tócala otra vez cuando se desocupe.",
    effect:
      "Cambia entre «Disponible» y «Ocupada» y avisa a los teléfonos de los clientes. Un pedido «Comer aquí» no ocupa la mesa por sí solo.",
    why: "Tú sabes cuándo se sentó alguien de verdad; el sistema solo lo muestra.",
    watch: "Cerrar el turno libera todas las mesas.",
  },
  {
    id: "spei-pay",
    label: "Transferencia",
    group: "Cobro",
    purpose:
      "Cobra un pedido que el cliente paga por transferencia bancaria en lugar de efectivo.",
    effect:
      "Abre los datos del banco y el monto exacto. Al confirmar, el pago se registra como transferencia: no suma efectivo en tu caja ni lleva cambio.",
    why: "El dinero llega al banco, no al cajón; registrarlo bien mantiene tu caja cuadrada.",
    watch:
      "Confirma solo después de ver la transferencia en la app del banco. Si el cliente eligió transferencia al pedir, el botón se resalta.",
  },
  {
    id: "spei-confirm",
    label: "Confirmar transferencia recibida",
    group: "Cobro",
    purpose: "Registra que la transferencia ya llegó y entrega el pedido.",
    effect:
      "Crea el pago por el total exacto como transferencia. Igual que el efectivo, tienes 5 segundos para «Deshacer».",
    why: "Es el único aviso de que ya cobraste ese pedido.",
    watch: "Tocarlo sin ver el dinero en el banco es regalar el pedido.",
  },
  {
    id: "ticket-badges",
    label: "Etiquetas del ticket",
    group: "Tablero",
    purpose:
      "En pedidos con varios platillos, las etiquetas de arriba resumen la preparación; «COMER AQUÍ» y «BBVA México» muestran dónde se come y cómo se pagará.",
    effect:
      "«SIN GRASA» y «FRITO» van seguidas del número de piezas (por ejemplo ×2), no de pedidos: un mismo ticket puede traer de las dos. Las etiquetas rojas dicen qué NO lleva y las verdes qué lleva de más.",
    why: "El cocinero y quien entrega saben qué preparar sin leer línea por línea.",
  },
  {
    id: "tab-completed",
    label: "Pedidos Completados",
    group: "Tablero",
    purpose: "Es el historial del turno: lo cobrado y los No-Show.",
    effect: "Puedes verificar cualquier cobro sin cerrar el turno.",
    why: "Resuelve en segundos el «yo ya pagué».",
  },
  {
    id: "completed-search",
    label: "Buscar cliente o #pedido…",
    group: "Historial",
    purpose: "Busca por nombre del cliente, número de pedido o platillo.",
    effect:
      "La lista se filtra mientras escribes y muestra monto, billete recibido y cambio.",
    why: "Encuentras un pedido sin revisar uno por uno.",
  },
  {
    id: "completed-filter",
    label: "Filtro del historial",
    group: "Historial",
    purpose:
      "Elige qué mostrar: todos, solo los entregados o solo los No-Show.",
    effect: "Solo cambia la lista que ves.",
    why: "Los No-Show se revisan aparte de las ventas.",
  },
  {
    id: "audio-unlock",
    label: "Iniciar turno · Activar timbre",
    group: "Encabezado",
    purpose: "Activa el sonido del tablero.",
    effect:
      "El navegador solo permite sonidos después de que alguien toca la pantalla. Al activarlo suena un timbre de prueba; desde ahí avisa cada pedido nuevo.",
    why: "Sin esto los pedidos llegan en silencio y nadie se entera.",
    watch: "Tócalo al empezar cada turno y sube el volumen del tablet.",
  },
  {
    id: "sound",
    label: "Sonido",
    group: "Encabezado",
    purpose: "Cambia el volumen del timbre: Normal, Suave o Silencio.",
    effect: "Solo afecta a este tablet.",
    why: "Ajusta el timbre al ruido de tu cocina.",
  },
  {
    id: "fullscreen",
    label: "Pantalla completa",
    group: "Encabezado",
    purpose:
      "Quita las barras del navegador para ver más tickets (modo kiosko).",
    effect: "Solo cambia cómo se ve la pantalla.",
    why: "Más espacio para los tickets.",
  },
  {
    id: "lock",
    label: "Bloquear sesión (candado)",
    group: "Encabezado",
    purpose: "Cierra tu sesión en este tablet.",
    effect:
      "El tablero se oculta hasta que se vuelva a escribir el PIN de 4 dígitos. Se apaga mientras haya un cobro en espera.",
    why: "Protege la caja si te alejas del mostrador.",
  },
  {
    id: "nav-analytics",
    label: "Caja y ventas",
    group: "Encabezado",
    purpose: "Abre la pantalla de ventas del turno.",
    effect:
      "Muestra Ventas cobradas, el efectivo recibido y el cambio, las transferencias si hubo, los platillos más vendidos y la tabla de transacciones. Desde ahí se cierra el turno.",
    why: "Aquí revisas que el efectivo de la caja coincide con lo cobrado en efectivo.",
  },
  {
    id: "sales-card",
    label: "Ventas cobradas · MXN",
    group: "Caja y ventas",
    purpose:
      "Es el total de los pedidos pagados en el turno. Los No-Show no suman.",
    effect:
      "Suma efectivo y transferencias. «Efectivo recibido» es el efectivo que entró y «Cambio» lo que devolviste. En cuanto hay una transferencia, la pantalla separa «Ventas en efectivo» y «Transferencias».",
    why: "Tu caja física solo debe cuadrar con las ventas en efectivo: una transferencia es dinero en el banco, no en el cajón.",
    watch: "Si hubo transferencias, no compares la caja con el total de «Ventas cobradas».",
  },
  {
    id: "close-shift",
    label: "Cerrar Turno",
    group: "Caja y ventas",
    purpose: "Inicia el cierre del turno.",
    effect:
      "Abre una confirmación con Ventas cobradas, No-Show y pedidos en fila.",
    why: "Es el último paso de cada turno.",
  },
  {
    id: "archive-close",
    label: "Archivar y cerrar",
    group: "Caja y ventas",
    purpose: "Cierra el turno de verdad.",
    effect:
      "Guarda un archivo permanente con el historial y los totales, y el nuevo turno empieza en cero. No funciona si todavía hay pedidos en fila.",
    why: "Deja el turno guardado y la caja lista para el siguiente.",
    watch: "Antes de cerrar entrega o anula cada pedido que siga en fila.",
  },
];

/** @type {Map<string, GlossaryEntry>} */
const BY_ID = new Map(GLOSSARY.map((entry) => [entry.id, entry]));

/** @param {string} id @returns {GlossaryEntry | undefined} */
export function glossaryEntry(id) {
  return BY_ID.get(id);
}
