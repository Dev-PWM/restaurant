// @ts-check
"use strict";

import { glossaryEntry } from "./glossary.js";

/**
 * The Academy curriculum as data. Adding a module means adding an object here: the
 * state machine in engine.js, the coachmarks and the module menu are all generic.
 *
 * Text rules: say only what the real app does (see glossary.js), use the exact label
 * printed on each control, and keep every sentence short enough to read in a few
 * seconds with greasy hands.
 *
 * @typedef {"tablero"|"flujo"|"exigente"|"cobros"|"errores"|"cocina"|"historial"|"panico"|"cierre"|"etiquetas"|"tiempos"|"mesas"|"transferencia"} ModuleId
 *
 * @typedef {Object} StepView
 * @property {"queue"|"tables"|"completed"} [tab]
 * @property {"review"|"cooking"|"ready"} [lane]   Lane to show on phones, where only one lane is visible.
 * @property {boolean} [kitchenOnly]
 *
 * @typedef {{type: string, test?: (event: AcademyEvent) => boolean, [key: string]: unknown}} Expectation
 * @typedef {{type: string, [key: string]: unknown}} AcademyEvent
 *
 * @typedef {Object} Step
 * @property {string} id
 * @property {"act"|"info"} kind        act: tap the target. info: read, then «Entendido».
 * @property {string} target            data-tour-target of the control to spotlight.
 * @property {string} [control]         Glossary id: supplies consequence and why unless overridden.
 * @property {string} title
 * @property {string} instruction
 * @property {string} [consequence]
 * @property {string} [why]
 * @property {Expectation} [expect]     The UI event that completes an act step.
 * @property {StepView} [view]
 * @property {boolean} [typing]         The cash field accepts typing on this step.
 *
 * @typedef {Object} QuizOption
 * @property {string} text
 * @property {boolean} [correct]
 * @property {string} explain
 *
 * @typedef {Object} ModuleDef
 * @property {ModuleId} id
 * @property {number} number
 * @property {string} title
 * @property {string} subtitle
 * @property {string} description
 * @property {boolean} required   Needed to unlock the live till for a new tablet.
 * @property {number} minutes
 * @property {string[]} takeaways
 * @property {{question: string, options: QuizOption[]}} quiz
 * @property {Step[]} steps
 */

/** @type {ModuleDef[]} */
export const MODULES = [
  {
    id: "tablero",
    number: 1,
    title: "Conoce tu Tablero",
    subtitle: "Las 3 filas, el ticket y cada botón",
    description:
      "Un recorrido rápido para saber qué significa cada parte de la pantalla antes de tocar nada.",
    required: true,
    minutes: 3,
    takeaways: [
      "Los pedidos nuevos llegan a «En revisión», pasan a «Cocinando» y terminan en «Lista para recoger».",
      "Etiqueta roja = SIN ingrediente. Etiqueta verde = extra. Léelas siempre.",
      "Activa el timbre al empezar cada turno o los pedidos llegan en silencio.",
    ],
    quiz: {
      question:
        "Un cliente acaba de mandar su pedido desde el teléfono. ¿En qué fila lo ves primero?",
      options: [
        {
          text: "En revisión",
          correct: true,
          explain: "Correcto. Ahí esperan hasta que tú los aceptes.",
        },
        {
          text: "Cocinando",
          explain:
            "Todavía no: a «Cocinando» solo pasan los pedidos que tú aceptas.",
        },
        {
          text: "Lista para recoger",
          explain: "Todavía no: ahí llegan hasta que la cocina los termina.",
        },
      ],
    },
    steps: [
      {
        id: "tablero-1",
        kind: "info",
        target: "lane-review",
        control: "lane-review",
        title: "Fila 1 · En revisión",
        instruction:
          "Aquí llegan los pedidos nuevos que los clientes mandan desde su teléfono.",
        view: { tab: "queue", lane: "review", kitchenOnly: false },
      },
      {
        id: "tablero-2",
        kind: "info",
        target: "lane-cooking",
        control: "lane-cooking",
        title: "Fila 2 · Cocinando",
        instruction:
          "Aquí están los pedidos que ya aceptaste y se están preparando.",
        view: { tab: "queue", lane: "cooking" },
      },
      {
        id: "tablero-3",
        kind: "info",
        target: "lane-ready",
        control: "lane-ready",
        title: "Fila 3 · Lista para recoger",
        instruction:
          "Aquí esperan los pedidos terminados. Aquí es donde se cobra.",
        view: { tab: "queue", lane: "ready" },
      },
      {
        id: "tablero-4",
        kind: "info",
        target: "ticket-card",
        control: "ticket",
        title: "Así se lee un ticket",
        instruction:
          "Número y nombre arriba, platillos en medio, hora y total abajo. Fíjate en las etiquetas de colores.",
        view: { tab: "queue", lane: "review" },
      },
      {
        id: "tablero-5",
        kind: "info",
        target: "ticket-timer",
        control: "timer",
        title: "El reloj del ticket",
        instruction: "Este reloj cuenta cuánto lleva esperando el pedido.",
        view: { tab: "queue", lane: "review" },
      },
      {
        id: "tablero-6",
        kind: "info",
        target: "btn-inventory",
        control: "inventory",
        title: "Botón «Inventario»",
        instruction: "Úsalo cuando se acabe un platillo.",
      },
      {
        id: "tablero-7",
        kind: "info",
        target: "btn-panic-pause",
        control: "pause-web",
        title: "Botón «Pausar pedidos web»",
        instruction: "Es el botón de pánico para cuando la cocina se satura.",
      },
      {
        id: "tablero-8",
        kind: "info",
        target: "btn-kitchen-mode",
        control: "kitchen-mode",
        title: "Botón «Modo Cocina»",
        instruction:
          "Para la pantalla del comal: deja solo lo que se cocina y lo que está listo.",
        view: { tab: "queue" },
      },
      {
        id: "tablero-9",
        kind: "info",
        target: "tab-completed",
        control: "tab-completed",
        title: "Pestaña «Pedidos Completados»",
        instruction:
          "El historial del turno: lo que ya cobraste y los No-Show.",
      },
      {
        id: "tablero-10",
        kind: "info",
        target: "btn-lock",
        control: "lock",
        title: "El candado",
        instruction:
          "Cierra tu sesión en este tablet cuando te alejes de la caja.",
      },
      {
        id: "tablero-11",
        kind: "act",
        target: "btn-audio-unlock",
        control: "audio-unlock",
        title: "Activa el timbre",
        instruction:
          "Toca «Iniciar turno · Activar timbre». Debes escuchar un timbre de prueba.",
        expect: { type: "audio-unlocked" },
      },
    ],
  },

  {
    id: "flujo",
    number: 2,
    title: "El Flujo Perfecto",
    subtitle: "Aceptar → Lista → Cobrar",
    description:
      "El camino de cada pedido, de que entra a cocina a que lo cobras en efectivo.",
    required: true,
    minutes: 3,
    takeaways: [
      "Aceptar avisa al cliente que ya empezó su pedido; Lista le avisa que ya puede pasar.",
      "Se cobra al entregar, desde «Lista para recoger».",
      "Toca el billete que te dieron y lee el cambio en pantalla: no lo calcules de memoria.",
    ],
    quiz: {
      question:
        "El cliente llega al mostrador por su pedido. ¿Cuándo se cobra?",
      options: [
        {
          text: "Al entregar, desde «Lista para recoger»",
          correct: true,
          explain: "Correcto: se cobra al entregar, siempre.",
        },
        {
          text: "Al aceptar el pedido",
          explain:
            "No: al aceptar solo empieza la cocina. El cobro es al entregar.",
        },
        {
          text: "Al final del turno",
          explain: "No: cada pedido se cobra al momento de entregarlo.",
        },
      ],
    },
    steps: [
      {
        id: "flujo-1",
        kind: "act",
        target: "accept-demo-order",
        control: "accept",
        title: "1. Acepta el pedido",
        instruction: "Toca «Aceptar y empezar a cocinar».",
        expect: { type: "accept" },
        view: { tab: "queue", lane: "review", kitchenOnly: false },
      },
      {
        id: "flujo-2",
        kind: "act",
        target: "mark-demo-ready",
        control: "ready",
        title: "2. Márcalo lista",
        instruction:
          "La comida ya está hecha. Toca «Marcar lista para recoger».",
        expect: { type: "ready" },
        view: { lane: "cooking" },
      },
      {
        id: "flujo-3",
        kind: "act",
        target: "pay-demo-order",
        control: "pay",
        title: "3. Cobra al entregar",
        instruction: "El cliente llegó. Toca «Cobrar al entregar».",
        expect: { type: "open-pay" },
        view: { lane: "ready" },
      },
      {
        id: "flujo-4",
        kind: "act",
        target: "tender-200",
        control: "tender-preset",
        title: "4. Anota el billete",
        instruction: "El cliente te da un billete de $200. Toca «$200.00».",
        consequence:
          "El sistema calcula el cambio al instante: $200.00 menos $185.00 = $15.00.",
        expect: { type: "tender", cents: 20000 },
      },
      {
        id: "flujo-5",
        kind: "act",
        target: "confirm-demo-payment",
        control: "confirm-payment",
        title: "5. Confirma el pago",
        instruction:
          "Entrega los $15.00 de cambio y toca «Confirmar pago y entregar».",
        expect: { type: "confirm-payment", cents: 20000 },
      },
    ],
  },

  {
    id: "exigente",
    number: 3,
    title: "El Cliente Exigente",
    subtitle: "Lee las etiquetas rojas",
    description:
      "Pedidos con «SIN …». Practica el hábito de leer la etiqueta antes de pasar el pedido.",
    required: true,
    minutes: 3,
    takeaways: [
      "Las etiquetas rojas dicen qué NO lleva el platillo; las verdes, qué lleva de más.",
      "En la caja real nada te frena: tú eres el candado. Lee la etiqueta antes de marcar lista.",
      "Un pedido personalizado se cobra igual que cualquier otro.",
    ],
    quiz: {
      question:
        "El ticket trae una etiqueta roja que dice «Sin queso». ¿Qué haces?",
      options: [
        {
          text: "La leo antes de marcar el pedido como lista",
          correct: true,
          explain:
            "Correcto: leer la etiqueta evita devoluciones y problemas con alergias.",
        },
        {
          text: "La ignoro, casi nadie lo nota",
          explain: "No: el cliente sí lo nota, y puede ser por una alergia.",
        },
        {
          text: "Cobro doble por la molestia",
          explain:
            "No: el sistema cobra el total del ticket; las omisiones no cuestan extra.",
        },
      ],
    },
    steps: [
      {
        id: "exigente-1",
        kind: "act",
        target: "acknowledge-restriction",
        title: "1. Lee la etiqueta roja",
        instruction:
          "Este pedido trae una petición especial. Toca el botón rojo para confirmar que leíste «SIN QUESO».",
        consequence:
          "Es un ejercicio de entrenamiento: en la caja real el ticket solo muestra la etiqueta y no te frena. Aquí practicas leerla antes de aceptar el pedido.",
        why: "Quien cocina y quien entrega deben saber qué NO lleva el platillo.",
        expect: { type: "ack-restriction" },
        view: { tab: "queue", lane: "review", kitchenOnly: false },
      },
      {
        id: "exigente-2",
        kind: "act",
        target: "accept-demo-order",
        control: "accept",
        title: "2. Acepta el pedido",
        instruction:
          "Ya leíste la etiqueta, así que se desbloqueó «Aceptar y empezar a cocinar». Tócalo.",
        expect: { type: "accept" },
        view: { lane: "review" },
      },
      {
        id: "exigente-3",
        kind: "act",
        target: "mark-demo-ready",
        control: "ready",
        title: "3. Márcalo lista",
        instruction: "Toca «Marcar lista para recoger».",
        expect: { type: "ready" },
        view: { lane: "cooking" },
      },
      {
        id: "exigente-4",
        kind: "act",
        target: "pay-demo-order",
        control: "pay",
        title: "4. Cobra al entregar",
        instruction: "Toca «Cobrar al entregar».",
        expect: { type: "open-pay" },
        view: { lane: "ready" },
      },
      {
        id: "exigente-5",
        kind: "act",
        target: "tender-200",
        control: "tender-preset",
        title: "5. Anota el billete",
        instruction: "El cliente paga con $200. Toca «$200.00».",
        consequence:
          "El sistema calcula el cambio: $200.00 menos $185.00 = $15.00.",
        expect: { type: "tender", cents: 20000 },
      },
      {
        id: "exigente-6",
        kind: "act",
        target: "confirm-demo-payment",
        control: "confirm-payment",
        title: "6. Confirma el pago",
        instruction: "Entrega el cambio y toca «Confirmar pago y entregar».",
        expect: { type: "confirm-payment", cents: 20000 },
      },
    ],
  },

  {
    id: "cobros",
    number: 4,
    title: "Cobros al Centavo",
    subtitle: "Escribir montos y «Falta por recibir»",
    description:
      "Qué hacer cuando el cliente no paga con un billete exacto, y por qué a veces el botón de confirmar está apagado.",
    required: true,
    minutes: 3,
    takeaways: [
      "Si el cliente paga con un monto raro, escríbelo en «Efectivo recibido».",
      "«Falta por recibir» significa que el dinero no alcanza: el botón de confirmar se apaga a propósito.",
      "«Efectivo exacto» cobra el total de un solo toque.",
    ],
    quiz: {
      question:
        "El cliente da $300 y la cuenta es de $370.00. ¿Qué muestra el sistema?",
      options: [
        {
          text: "«Falta por recibir $70.00» y no deja confirmar",
          correct: true,
          explain: "Correcto: el sistema no te deja cobrar de menos.",
        },
        {
          text: "«Cambio a entregar $70.00»",
          explain:
            "No: el cambio se da cuando el cliente paga de más. Aquí falta dinero.",
        },
        {
          text: "Confirma el pago por $300.00",
          explain: "No: el botón se apaga hasta que el efectivo alcance.",
        },
      ],
    },
    steps: [
      {
        id: "cobros-1",
        kind: "act",
        target: "pay-demo-order",
        control: "pay",
        title: "1. Cobra al entregar",
        instruction: "Este pedido es de $370.00. Toca «Cobrar al entregar».",
        expect: { type: "open-pay" },
        view: { tab: "queue", lane: "ready", kitchenOnly: false },
      },
      {
        id: "cobros-2",
        kind: "act",
        target: "cash-input",
        control: "cash-input",
        typing: true,
        title: "2. Escribe lo que te dieron",
        instruction:
          "El cliente te da $300. Toca el campo «Efectivo recibido» y escribe 300.",
        expect: { type: "amount-typed", cents: 30000 },
      },
      {
        id: "cobros-3",
        kind: "info",
        target: "cash-change",
        control: "cash-change",
        title: "Mira «Falta por recibir»",
        instruction:
          "Faltan $70.00. Fíjate que «Confirmar pago y entregar» está apagado a propósito.",
      },
      {
        id: "cobros-4",
        kind: "act",
        target: "exact-cash-pay",
        control: "exact-pay",
        title: "3. Cobra el total exacto",
        instruction:
          "El cliente completa lo que faltaba. Toca «Efectivo exacto · Cobrar y entregar $370.00».",
        expect: { type: "exact-pay" },
      },
    ],
  },

  {
    id: "errores",
    number: 5,
    title: "Errores y Fantasmas",
    subtitle: "«Deshacer» en 5 segundos y No-Show",
    description:
      "Cómo corregir un billete mal tocado a tiempo y cómo anular el pedido de alguien que nunca llegó.",
    required: true,
    minutes: 4,
    takeaways: [
      "Después de confirmar un pago tienes 5 segundos para tocar «Deshacer».",
      "Pasados los 5 segundos el pago queda registrado y ya no se puede cancelar desde el tablero.",
      "Un No-Show quita el pedido de la fila sin registrar dinero.",
    ],
    quiz: {
      question:
        "Confirmaste un pago con el billete equivocado. ¿De cuánto tiempo dispones para tocar «Deshacer»?",
      options: [
        {
          text: "5 segundos",
          correct: true,
          explain: "Correcto: son 5 segundos desde que confirmas.",
        },
        {
          text: "Hasta el final del turno",
          explain: "No: después de 5 segundos el pago ya quedó registrado.",
        },
        { text: "Un minuto", explain: "No: la ventana es de solo 5 segundos." },
      ],
    },
    steps: [
      {
        id: "errores-1",
        kind: "act",
        target: "pay-demo-order",
        control: "pay",
        title: "1. Cobra al entregar",
        instruction:
          "Un cliente te va a dar un billete de $500. Toca «Cobrar al entregar».",
        expect: { type: "open-pay" },
        view: { tab: "queue", lane: "ready", kitchenOnly: false },
      },
      {
        id: "errores-2",
        kind: "act",
        target: "tender-200",
        control: "tender-preset",
        title: "2. Error de dedo",
        instruction: "Por distracción, toca «$200.00» (aunque te dieron $500).",
        consequence:
          "El sistema cree que recibiste $200.00. Así pasan los errores reales con prisa.",
        why: "Quieres ver qué pasa cuando te equivocas, para no asustarte después.",
        expect: { type: "tender", cents: 20000 },
      },
      {
        id: "errores-3",
        kind: "act",
        target: "confirm-demo-payment",
        control: "confirm-payment",
        title: "3. Confirma el pago equivocado",
        instruction: "Toca «Confirmar pago y entregar».",
        consequence:
          "El pago queda en espera 5 segundos. (La alarma y el destello rojo son solo del entrenamiento; en la caja real fíjate en la cuenta regresiva del ticket.)",
        expect: { type: "confirm-payment", cents: 20000 },
      },
      {
        id: "errores-4",
        kind: "act",
        target: "undo-demo-payment",
        control: "undo",
        title: "4. ¡Deshacer!",
        instruction:
          "¡Rápido! Toca «Deshacer» antes de que la cuenta llegue a cero.",
        expect: { type: "undo" },
        view: { lane: "ready" },
      },
      {
        id: "errores-5",
        kind: "act",
        target: "pay-demo-order",
        control: "pay",
        title: "5. Cobra de nuevo",
        instruction: "Corregiste a tiempo. Toca «Cobrar al entregar» otra vez.",
        expect: { type: "open-pay" },
      },
      {
        id: "errores-6",
        kind: "act",
        target: "tender-500",
        control: "tender-preset",
        title: "6. Ahora sí, $500",
        instruction: "Toca el billete de «$500.00».",
        consequence:
          "El sistema calcula el cambio correcto: $500.00 menos $185.00 = $315.00.",
        expect: { type: "tender", cents: 50000 },
      },
      {
        id: "errores-7",
        kind: "act",
        target: "confirm-demo-payment",
        control: "confirm-payment",
        title: "7. Confirma el pago correcto",
        instruction:
          "Entrega $315.00 de cambio y toca «Confirmar pago y entregar».",
        expect: { type: "confirm-payment", cents: 50000 },
      },
      {
        id: "errores-8",
        kind: "act",
        target: "noshow-demo-order",
        control: "noshow",
        title: "8. Un cliente nunca llegó",
        instruction:
          "Este pedido lleva mucho tiempo sin recogerse. Toca «Anular pedido / No-Show».",
        expect: { type: "noshow-open" },
        view: { lane: "ready" },
      },
      {
        id: "errores-9",
        kind: "act",
        target: "noshow-confirm",
        control: "noshow-confirm",
        title: "9. Confirma el No-Show",
        instruction: "Toca «Confirmar No-Show».",
        expect: { type: "noshow-confirm" },
      },
    ],
  },

  {
    id: "cocina",
    number: 6,
    title: "La Cocina al Comal",
    subtitle: "Modo Cocina y «En el comal ahora»",
    description:
      "Para quien cocina: cómo dejar la pantalla limpia y saber cuántas piezas poner al comal juntas.",
    required: false,
    minutes: 2,
    takeaways: [
      "«Modo Cocina» solo cambia lo que ves; no modifica pedidos.",
      "«En el comal ahora» suma las piezas de todos los pedidos que se están cocinando.",
      "El resumen se actualiza solo cuando aceptas o marcas listos los pedidos.",
    ],
    quiz: {
      question: "¿Qué hace el botón «Modo Cocina»?",
      options: [
        {
          text: "Oculta la fila «En revisión» para ver solo lo que se cocina y lo que está listo",
          correct: true,
          explain: "Correcto: solo cambia lo que ves.",
        },
        {
          text: "Acepta todos los pedidos nuevos",
          explain: "No: nunca acepta pedidos por ti.",
        },
        {
          text: "Borra los pedidos terminados",
          explain: "No: no modifica ningún pedido.",
        },
      ],
    },
    steps: [
      {
        id: "cocina-1",
        kind: "act",
        target: "btn-kitchen-mode",
        control: "kitchen-mode",
        title: "1. Activa el Modo Cocina",
        instruction: "Toca «Modo Cocina».",
        expect: { type: "kitchen-mode", on: true },
        view: { tab: "queue", kitchenOnly: false },
      },
      {
        id: "cocina-2",
        kind: "info",
        target: "comal-summary",
        control: "comal-summary",
        title: "«En el comal ahora»",
        instruction:
          "Mira cuántas piezas de cada platillo están cocinándose en total.",
        view: { tab: "queue", kitchenOnly: true },
      },
      {
        id: "cocina-3",
        kind: "act",
        target: "mark-demo-ready",
        control: "ready",
        title: "2. Saca el primero del comal",
        instruction:
          "Toca «Marcar lista para recoger» en el primer ticket y mira cómo baja el resumen.",
        consequence:
          "El ticket pasa a «Lista para recoger» y «En el comal ahora» se actualiza solo con una pieza menos.",
        expect: { type: "ready" },
        view: { lane: "cooking" },
      },
      {
        id: "cocina-4",
        kind: "act",
        target: "btn-kitchen-mode",
        control: "kitchen-mode",
        title: "3. Vuelve a ver todas las filas",
        instruction: "Toca «Solo Cocina (Activo)» para desactivarlo.",
        expect: { type: "kitchen-mode", on: false },
      },
    ],
  },

  {
    id: "historial",
    number: 7,
    title: "Revisa lo Cobrado",
    subtitle: "Buscar un pedido en el historial",
    description: "Cómo resolver «yo ya pagué» en segundos sin cerrar el turno.",
    required: false,
    minutes: 2,
    takeaways: [
      "«Pedidos Completados» guarda lo cobrado y los No-Show del turno.",
      "Busca por nombre, número de pedido o platillo.",
      "El filtro separa los No-Show de las ventas.",
    ],
    quiz: {
      question:
        "Un cliente dice que ya pagó, pero no encuentras su ticket en la fila. ¿Dónde lo revisas?",
      options: [
        {
          text: "En «Pedidos Completados»",
          correct: true,
          explain: "Correcto: ahí están todos los cobros del turno.",
        },
        {
          text: "En «En revisión»",
          explain: "No: ahí solo están los pedidos nuevos.",
        },
        {
          text: "En el candado",
          explain: "No: el candado solo bloquea tu sesión.",
        },
      ],
    },
    steps: [
      {
        id: "historial-1",
        kind: "act",
        target: "tab-completed",
        control: "tab-completed",
        title: "1. Abre el historial",
        instruction: "Toca la pestaña «Pedidos Completados».",
        expect: { type: "tab", tab: "completed" },
        view: { tab: "queue", kitchenOnly: false },
      },
      {
        id: "historial-2",
        kind: "info",
        target: "completed-audit",
        title: "El resumen del turno",
        instruction:
          "Arriba ves cuántos pedidos se entregaron y cuánto suman las ventas verificadas.",
        consequence:
          "Estas cifras son del turno actual y se actualizan con cada cobro.",
        why: "Puedes comprobar la caja a mitad de turno sin cerrarlo.",
        view: { tab: "completed" },
      },
      {
        id: "historial-3",
        kind: "act",
        target: "completed-search",
        control: "completed-search",
        title: "2. Busca a un cliente",
        instruction:
          "Un cliente dice «yo ya pagué». Escribe «ana» en el buscador.",
        expect: {
          type: "search",
          test: (event) => String(event.text ?? "").trim().length >= 2,
        },
      },
      {
        id: "historial-4",
        kind: "act",
        target: "completed-filter",
        control: "completed-filter",
        title: "3. Filtra los No-Show",
        instruction: "Abre el filtro y elige «Solo No-Show».",
        expect: { type: "filter", value: "no_show" },
      },
    ],
  },

  {
    id: "panico",
    number: 8,
    title: "Pánico y Agotados",
    subtitle: "Apagar un platillo y pausar pedidos web",
    description:
      "Qué hacer cuando se acaba un ingrediente o la cocina se satura en la hora pico.",
    required: false,
    minutes: 3,
    takeaways: [
      "En «Inventario» apagas un platillo y el cambio es inmediato para los clientes.",
      "«Pausar pedidos web» detiene los pedidos nuevos del teléfono; los que ya estaban siguen.",
      "Acuérdate de reanudar los pedidos cuando se calme la cocina.",
    ],
    quiz: {
      question: "Se acabó el chicharrón. ¿Qué haces?",
      options: [
        {
          text: "Apago ese platillo en «Inventario»",
          correct: true,
          explain: "Correcto: los clientes lo verán «Agotado» al instante.",
        },
        {
          text: "Pauso los pedidos web",
          explain:
            "No: eso detiene TODOS los pedidos nuevos. Solo apaga el platillo que se acabó.",
        },
        {
          text: "Lo cancelo en cada ticket",
          explain:
            "No: es más lento y siguen entrando pedidos de ese platillo.",
        },
      ],
    },
    steps: [
      {
        id: "panico-1",
        kind: "act",
        target: "btn-inventory",
        control: "inventory",
        title: "1. Abre el Inventario",
        instruction: "Se acabó un ingrediente. Toca «Inventario».",
        expect: { type: "inventory-open" },
        view: { tab: "queue", kitchenOnly: false },
      },
      {
        id: "panico-2",
        kind: "act",
        target: "inv-toggle",
        control: "inventory-toggle",
        title: "2. Apaga el platillo",
        instruction:
          "Se acabó «{item}». Toca su interruptor para marcarlo «Agotado».",
        expect: { type: "inventory-toggle", available: false },
      },
      {
        id: "panico-3",
        kind: "act",
        target: "close-inventory",
        title: "3. Cierra la ventana",
        instruction: "Toca la «X» para volver a las comandas.",
        consequence:
          "El cambio ya se aplicó cuando tocaste el interruptor. La «X» solo cierra la ventana; no hay botón de guardar.",
        why: "Así el menú del cliente se actualiza sin pasos extra.",
        expect: { type: "inventory-close" },
      },
      {
        id: "panico-4",
        kind: "act",
        target: "btn-panic-pause",
        control: "pause-web",
        title: "4. El botón de pánico",
        instruction: "Llegó una multitud. Toca «Pausar pedidos web».",
        expect: { type: "pause", paused: true },
      },
      {
        id: "panico-5",
        kind: "act",
        target: "btn-panic-resume",
        control: "pause-web",
        title: "5. Reanuda los pedidos",
        instruction:
          "La cocina ya se puso al día. Toca «Reanudar pedidos web».",
        consequence:
          "El menú de pedidos vuelve a estar disponible para los clientes.",
        expect: { type: "pause", paused: false },
      },
    ],
  },

  {
    id: "cierre",
    number: 9,
    title: "Cierre de Turno",
    subtitle: "Caja y ventas → Cerrar Turno",
    description:
      "Revisar las ventas del turno y archivarlo al terminar, paso a paso.",
    required: false,
    minutes: 3,
    takeaways: [
      "El efectivo de tu caja debe cuadrar con lo cobrado en efectivo, no con las transferencias.",
      "«Archivar y cerrar» se apaga si todavía hay pedidos en fila.",
      "Al cerrar se guarda un archivo permanente y el nuevo turno empieza en cero.",
    ],
    quiz: {
      question:
        "«Archivar y cerrar» aparece apagado. ¿Cuál es la causa más común?",
      options: [
        {
          text: "Todavía hay pedidos en fila",
          correct: true,
          explain: "Correcto: entrega o anula cada pedido y se enciende.",
        },
        {
          text: "Se acabó el papel",
          explain: "No: la app no usa impresoras ni papel.",
        },
        {
          text: "El turno ya está cerrado",
          explain:
            "No: sería «Turno archivado». Revisa si quedan pedidos en fila.",
        },
      ],
    },
    steps: [
      {
        id: "cierre-1",
        kind: "act",
        target: "btn-nav-analytics",
        control: "nav-analytics",
        title: "1. Abre «Caja y ventas»",
        instruction: "El turno terminó. Toca «Caja y ventas».",
        expect: { type: "nav-analytics" },
        view: { tab: "queue", kitchenOnly: false },
      },
      {
        id: "cierre-2",
        kind: "info",
        target: "analytics-sales-card",
        control: "sales-card",
        title: "Tus ventas del turno",
        instruction:
          "Aquí ves lo cobrado en las prácticas. Como hubo una transferencia, la pantalla separa «Ventas en efectivo» de «Transferencias».",
      },
      {
        id: "cierre-3",
        kind: "info",
        target: "analytics-sales-card",
        title: "Hábito recomendado",
        instruction:
          "Cuenta el efectivo físico de tu caja y compáralo con las ventas en efectivo. Si hubo transferencias, «Ventas en efectivo» las separa de «Ventas cobradas».",
        consequence:
          "El sistema no te pide contar el efectivo ni lo compara por ti: es un hábito tuyo.",
        why: "Si no cuadra, es más fácil encontrar el error el mismo día.",
      },
      {
        id: "cierre-4",
        kind: "act",
        target: "btn-close-shift",
        control: "close-shift",
        title: "2. Inicia el cierre",
        instruction: "Toca «Cerrar Turno».",
        expect: { type: "close-shift-open" },
      },
      {
        id: "cierre-5",
        kind: "info",
        target: "close-shift-summary",
        title: "La confirmación",
        instruction:
          "Aquí ves las ventas cobradas, los No-Show y cuántos pedidos siguen en fila.",
        consequence:
          "Si hay pedidos en fila, «Archivar y cerrar» se apaga: primero entrega o anula cada uno.",
        why: "Evita que un pedido quede sin cobrar al cerrar.",
      },
      {
        id: "cierre-6",
        kind: "act",
        target: "btn-confirm-close-shift",
        control: "archive-close",
        title: "3. Archiva y cierra",
        instruction: "Toca «Archivar y cerrar».",
        expect: { type: "close-shift-confirm" },
      },
    ],
  },

  {
    id: "etiquetas",
    number: 10,
    title: "Lee el Ticket",
    subtitle: "Grasa, quesillo, mesa y pago",
    description:
      "Qué significa cada etiqueta de color arriba del ticket, para preparar y entregar sin errores.",
    required: false,
    minutes: 3,
    takeaways: [
      "«SIN GRASA» es comal seco y «FRITO» lleva grasa; el número que sigue es cuántas piezas.",
      "«+ QUESILLO EXTRA» es un extra de pago y «COMER AQUÍ» avisa que se entrega en el comedor.",
      "La etiqueta «BBVA México» indica que el cliente eligió transferencia; tú registras cómo pagó de verdad.",
    ],
    quiz: {
      question:
        "Un ticket trae las etiquetas «SIN GRASA» y «FRITO». ¿Qué significa?",
      options: [
        {
          text: "Hay piezas para el comal sin grasa y piezas para freír",
          correct: true,
          explain:
            "Correcto: cada etiqueta cuenta las piezas que llevan ese modo de cocinar.",
        },
        {
          text: "El pedido está duplicado",
          explain:
            "No: es el mismo pedido, con platillos que se cocinan de dos maneras.",
        },
        {
          text: "Hay que preguntarle al cliente cuál prefiere",
          explain:
            "No: el cliente ya eligió al pedir. Cada línea del ticket dice qué lleva.",
        },
      ],
    },
    steps: [
      {
        id: "etiquetas-1",
        kind: "info",
        target: "badge-sin-grasa",
        control: "ticket-badges",
        title: "«SIN GRASA»",
        instruction:
          "Estas piezas van al comal sin grasa. El número es cuántas piezas son, no cuántos pedidos.",
        view: { tab: "queue", lane: "review", kitchenOnly: false },
      },
      {
        id: "etiquetas-2",
        kind: "info",
        target: "badge-frito",
        control: "ticket-badges",
        title: "«FRITO»",
        instruction:
          "Estas piezas se fríen. Un mismo ticket puede traer piezas de las dos clases.",
      },
      {
        id: "etiquetas-3",
        kind: "info",
        target: "badge-quesillo",
        control: "ticket-badges",
        title: "«+ QUESILLO EXTRA»",
        instruction:
          "Al menos un platillo lleva quesillo extra, que ya está sumado al total del ticket.",
      },
      {
        id: "etiquetas-4",
        kind: "info",
        target: "badge-dine-in",
        control: "ticket-badges",
        title: "«COMER AQUÍ»",
        instruction:
          "El cliente come en el comedor. Si no trae esta etiqueta, el pedido es para llevar.",
      },
      {
        id: "etiquetas-5",
        kind: "info",
        target: "badge-spei",
        control: "ticket-badges",
        title: "«BBVA México»",
        instruction:
          "El cliente eligió pagar por transferencia. Al cobrar, el botón de transferencia estará resaltado.",
      },
      {
        id: "etiquetas-6",
        kind: "act",
        target: "acknowledge-restriction",
        title: "Lee la etiqueta roja",
        instruction:
          "Las etiquetas rojas dicen lo que NO lleva. Toca el botón rojo para confirmar que leíste «Sin cebolla».",
        consequence:
          "Es un ejercicio de entrenamiento: en la caja real el ticket solo muestra la etiqueta y no te frena.",
        why: "Quien cocina debe saber qué quitarle al platillo antes de empezar.",
        expect: { type: "ack-restriction" },
      },
    ],
  },

  {
    id: "tiempos",
    number: 11,
    title: "Tiempos del Comal",
    subtitle: "Ámbar, rojo y qué atender primero",
    description:
      "Cómo leer el reloj de cada ticket para atender primero a quien más lleva esperando.",
    required: false,
    minutes: 3,
    takeaways: [
      "En revisión el ticket se pone ámbar a los 2 minutos y rojo a los 3; cocinando, ámbar a los 5 y rojo a los 15.",
      "Atiende primero el rojo: es el cliente que más lleva esperando.",
      "El reloj corre solo: cuenta desde que llegó el pedido y, ya cocinando, desde que lo aceptaste.",
    ],
    quiz: {
      question:
        "Hay un ticket en rojo y otro en ámbar esperando. ¿Cuál atiendes primero?",
      options: [
        {
          text: "El rojo: es el que más lleva esperando",
          correct: true,
          explain: "Correcto: el color te dice quién espera más.",
        },
        {
          text: "El ámbar, porque es más fácil de cocinar",
          explain: "No: el color decide el orden, no lo fácil del platillo.",
        },
        {
          text: "El que tenga más platillos",
          explain: "No: el reloj decide el orden, no el tamaño del pedido.",
        },
      ],
    },
    steps: [
      {
        id: "tiempos-1",
        kind: "info",
        target: "ticket-timer",
        control: "timer",
        title: "El reloj de cada ticket",
        instruction:
          "Cada ticket cuenta cuánto lleva esperando. Este lleva 4 minutos en revisión: ya está en rojo.",
        view: { tab: "queue", lane: "review", kitchenOnly: false },
      },
      {
        id: "tiempos-2",
        kind: "info",
        target: "lane-cooking",
        control: "timer",
        title: "En el comal los tiempos son otros",
        instruction:
          "En «Cocinando» el ámbar empieza a los 5 minutos y el rojo a los 15. Aquí hay uno de 16 minutos y otro de 6.",
        view: { lane: "cooking" },
      },
      {
        id: "tiempos-3",
        kind: "act",
        target: "accept-demo-order",
        control: "accept",
        title: "1. Acepta primero el rojo",
        instruction:
          "Carlos lleva 4 minutos esperando. Toca «Aceptar y empezar a cocinar» en su ticket.",
        expect: { type: "accept" },
        view: { lane: "review" },
      },
      {
        id: "tiempos-4",
        kind: "act",
        target: "mark-demo-ready",
        control: "ready",
        title: "2. Saca primero al que más lleva",
        instruction:
          "Luis lleva 16 minutos en el comal: es el más urgente. Toca «Marcar lista para recoger» en su ticket.",
        expect: { type: "ready" },
        view: { lane: "cooking" },
      },
    ],
  },

  {
    id: "mesas",
    number: 12,
    title: "Mesas y Comedor",
    subtitle: "Marca ocupada y libera",
    description:
      "Cómo marcar las mesas del comedor para que los clientes sepan si pueden comer aquí.",
    required: false,
    minutes: 2,
    takeaways: [
      "Toca una mesa cuando sientes a alguien y tócala otra vez cuando se desocupe.",
      "Los clientes ven cuántas mesas hay libres cuando eligen «Comer aquí»; sin mesas, esa opción se apaga sola.",
      "Un pedido «Comer aquí» no ocupa la mesa por sí solo, y cerrar el turno las libera todas.",
    ],
    quiz: {
      question: "Entra un pedido «Comer aquí». ¿Qué pasa con las mesas?",
      options: [
        {
          text: "Nada: yo marco la mesa cuando siento al cliente",
          correct: true,
          explain: "Correcto: el sistema solo muestra lo que tú marcas.",
        },
        {
          text: "Se marca una mesa ocupada sola",
          explain: "No: ningún pedido cambia una mesa; eso lo haces tú.",
        },
        {
          text: "Se bloquean todas las mesas",
          explain: "No: las mesas solo cambian cuando tú las tocas.",
        },
      ],
    },
    steps: [
      {
        id: "mesas-1",
        kind: "act",
        target: "tab-tables",
        control: "tab-tables",
        title: "1. Abre el control de mesas",
        instruction: "Toca la pestaña «Control de Mesas».",
        expect: { type: "tab", tab: "tables" },
        view: { tab: "queue", kitchenOnly: false },
      },
      {
        id: "mesas-2",
        kind: "act",
        target: "table-card-1",
        control: "table-card",
        title: "2. Sienta a los clientes",
        instruction:
          "Llegó una familia. Toca la mesa 1 para marcarla «Ocupada».",
        consequence:
          "La mesa pasa a ocupada y los clientes ven una mesa libre menos.",
        expect: { type: "table-toggle", tableNumber: 1, status: "occupied" },
        view: { tab: "tables" },
      },
      {
        id: "mesas-3",
        kind: "act",
        target: "table-card-2",
        control: "table-card",
        title: "3. Libera una mesa",
        instruction:
          "La mesa 2 ya se desocupó. Tócala para dejarla «Disponible».",
        consequence:
          "La mesa vuelve a estar libre y los clientes ven una más disponible.",
        expect: { type: "table-toggle", tableNumber: 2, status: "available" },
      },
      {
        id: "mesas-4",
        kind: "info",
        target: "table-map",
        title: "Un pedido no ocupa mesas",
        instruction:
          "Aunque un cliente pida «Comer aquí», la mesa solo cambia cuando tú la tocas.",
        consequence:
          "El ticket lleva la etiqueta «COMER AQUÍ», pero las mesas siguen como las dejaste.",
        why: "Tú ves cuándo se sentó alguien de verdad.",
      },
      {
        id: "mesas-5",
        kind: "info",
        target: "table-map",
        title: "Al cerrar el turno",
        instruction:
          "Cuando cierras el turno todas las mesas quedan libres para el siguiente.",
        consequence:
          "No tienes que liberarlas una por una antes de cerrar.",
        why: "El nuevo turno empieza con el comedor vacío.",
      },
    ],
  },

  {
    id: "transferencia",
    number: 13,
    title: "Pagar con Transferencia",
    subtitle: "Transferencia sin tocar la caja",
    description:
      "Qué hacer cuando el cliente paga por transferencia bancaria: verificar en el banco y registrar el pago.",
    required: false,
    minutes: 3,
    takeaways: [
      "Una transferencia es dinero en el banco: nunca entra a tu caja ni lleva cambio.",
      "Confirma solo después de ver la transferencia en la app del banco, con el monto exacto.",
      "Si el cliente eligió transferencia al pedir, el botón se resalta; aun así tú decides cómo cobrar.",
    ],
    quiz: {
      question:
        "El cliente dice que ya transfirió, pero no ves nada en la app del banco. ¿Qué haces?",
      options: [
        {
          text: "No confirmo hasta ver la transferencia",
          correct: true,
          explain:
            "Correcto: confirmar sin verla es entregar el pedido sin cobrarlo.",
        },
        {
          text: "Confirmo, seguro llega en un rato",
          explain:
            "No: si no llega, ya entregaste y el sistema ya registró el cobro.",
        },
        {
          text: "Cobro en efectivo y también confirmo la transferencia",
          explain: "No: cobrarías dos veces el mismo pedido.",
        },
      ],
    },
    steps: [
      {
        id: "transferencia-1",
        kind: "info",
        target: "badge-spei",
        control: "ticket-badges",
        title: "Mira la etiqueta «BBVA México»",
        instruction:
          "Esta cliente eligió pagar por transferencia al hacer su pedido.",
        view: { tab: "queue", lane: "ready", kitchenOnly: false },
      },
      {
        id: "transferencia-2",
        kind: "act",
        target: "pay-demo-order",
        control: "pay",
        title: "1. Cobra al entregar",
        instruction: "Toca «Cobrar al entregar».",
        expect: { type: "open-pay" },
      },
      {
        id: "transferencia-3",
        kind: "act",
        target: "btn-spei-tender",
        control: "spei-pay",
        title: "2. Elige transferencia",
        instruction:
          "Toca el botón de «Transferencia». Está resaltado porque la cliente lo eligió.",
        expect: { type: "spei-open" },
      },
      {
        id: "transferencia-4",
        kind: "info",
        target: "spei-modal",
        title: "Los datos del banco",
        instruction:
          "Aquí ves el monto exacto, la CLABE y la referencia con el número de pedido. Abre la app del banco y busca esa transferencia.",
        consequence: "Todavía no se registra nada: solo estás mirando los datos.",
        why: "Verificar antes de confirmar evita entregar sin cobrar.",
      },
      {
        id: "transferencia-5",
        kind: "act",
        target: "confirm-spei-payment",
        control: "spei-confirm",
        title: "3. Confirma la recepción",
        instruction:
          "En la práctica la transferencia ya llegó. Toca «Confirmar transferencia recibida».",
        expect: { type: "spei-pay" },
      },
    ],
  },
];

/** Tips shown before the timed challenge. */
export const RUSH_TIPS = [
  "Toca la etiqueta roja de cada ticket y luego acéptalo: sin leerla no se desbloquea.",
  "Acepta todos los pedidos de «En revisión» antes de empezar a cobrar.",
  "Cobra con «Efectivo exacto» para ir más rápido.",
  "Si te equivocas de billete, toca «Deshacer» de inmediato.",
];

/** @type {Map<string, ModuleDef>} */
const BY_ID = new Map(MODULES.map((module) => [module.id, module]));

/** @param {string} id @returns {ModuleDef | undefined} */
export function getModule(id) {
  return BY_ID.get(id);
}

export const MODULE_ORDER = /** @type {ModuleId[]} */ (
  MODULES.map((module) => module.id)
);
export const REQUIRED_MODULES = /** @type {ModuleId[]} */ (
  MODULES.filter((module) => module.required).map((module) => module.id)
);
export const TOTAL_STEPS = MODULES.reduce(
  (sum, module) => sum + module.steps.length,
  0,
);

/**
 * A step with its consequence and «why» filled in from the glossary when the step
 * does not carry its own, and with `{item}` replaced by the practice dish name.
 *
 * @typedef {Step & {consequence: string, why: string, moduleId: ModuleId, moduleNumber: number, moduleTitle: string, stepNumber: number, totalSteps: number}} ResolvedStep
 *
 * @param {Step} step
 * @param {ModuleDef} module
 * @param {number} index
 * @param {{item?: string}} [context]
 * @returns {ResolvedStep}
 */
export function resolveStep(step, module, index, context = {}) {
  const entry = step.control ? glossaryEntry(step.control) : undefined;
  const fill = (/** @type {string} */ text) =>
    text.replaceAll("{item}", context.item ?? "el platillo");
  return {
    ...step,
    title: fill(step.title),
    instruction: fill(step.instruction),
    consequence: fill(step.consequence ?? entry?.effect ?? ""),
    why: fill(step.why ?? entry?.why ?? ""),
    moduleId: module.id,
    moduleNumber: module.number,
    moduleTitle: module.title,
    stepNumber: index + 1,
    totalSteps: module.steps.length,
  };
}
