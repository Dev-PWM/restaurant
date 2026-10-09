# MasaFlow Academy («Guía interactiva»)

The interactive training mode of the staff POS (`/pos/`). It teaches a new cashier what every button means, what it
does behind the scenes, and why it matters, using local ghost tickets that never touch the real ledger.

Code: `apps/business-pos/src/academy/`. Scenario data: `apps/business-pos/src/simulator.js`. Tests:
`tests/academy-engine.test.js`, `tests/pos-simulator.test.js`.

## 1. How a trainee meets it

- A tablet that has never trained does **not** open the Academy by itself (it used to; the board was changed to
  «non-intrusive onboarding: do not force-trap on login»). The real board opens normally and the «Comenzar Entrenamiento»
  button pulses, with the number of pending modules on it. Practising suspends the live feed, so the button is disabled
  while a payment is waiting out its undo window; start it at any quiet moment.
- «Salir del Simulador» (back to the real board) is always in the Academy bar, even before the required modules and the
  Reto Almuerzo are done, so training can never trap anyone away from the live till. Finishing the curriculum is what
  writes `masaflow_trained`; leaving early does not.
- **Emergency skip:** in the module menu, hold the red button for 5 seconds. This writes
  `masaflow_training_skipped` (an ISO date) and unlocks the till. It never writes `masaflow_trained`, so the
  reminder banner keeps appearing on that tablet.
- The gate is **per device** (`localStorage`). A new tablet, a cleared browser or a private window trains again.

## 2. Curriculum

| #   | Module id   | Title               | Steps | Required |
| --- | ----------- | ------------------- | ----- | -------- |
| 1   | `tablero`   | Conoce tu Tablero   | 11    | yes      |
| 2   | `flujo`     | El Flujo Perfecto   | 5     | yes      |
| 3   | `exigente`  | El Cliente Exigente | 6     | yes      |
| 4   | `cobros`    | Cobros al Centavo   | 4     | yes      |
| 5   | `errores`   | Errores y Fantasmas | 9     | yes      |
| 6   | `cocina`    | La Cocina al Comal  | 4     | no       |
| 7   | `historial` | Revisa lo Cobrado   | 4     | no       |
| 8   | `panico`    | Pánico y Agotados   | 5     | no       |
| 9   | `cierre`    | Cierre de Turno     | 6     | no       |
| 10  | `etiquetas` | Lee el Ticket       | 6     | no       |
| 11  | `tiempos`   | Tiempos del Comal   | 4     | no       |
| 12  | `mesas`     | Mesas y Comedor     | 5     | no       |
| 13  | `transferencia` | Pagar con Transferencia | 5 | no   |

Every module ends with a short quiz (wrong answers explain themselves) and a recap card («Lo que aprendiste»).
Finishing the five required modules unlocks the **Reto Almuerzo**: five ghost tickets, 60 seconds, every ticket
must be _paid_ (a No-Show never counts toward passing, and finishing at exactly 60 s still passes — see
`evaluateRush`). Passing it graduates the trainee («¡Taquero Experto!») and writes `masaflow_trained = "true"`.

Which modules are required is one flag (`required: true`) per module in `curriculum.js`; change the policy there.

Modules 10-13 teach the features added after the first Academy: ticket tags, ticket timing, the dining-room tables and SPEI payments.
They are optional on purpose. (A module 14, «Platillos Nuevos», taught the «Crear Platillo» screen; it was removed together with that screen.) A tablet that already graduated is not locked out; the modules show as pending
reminders on the «Entrenamiento» button. Making one required is a one-line change (`required: true`), but it must stay after the
current required ones (the curriculum test enforces that order).

Notes on how the newer lessons work:

- **«Lee la etiqueta roja» comes before «Aceptar».** In practice, a ticket with a «SIN …» request keeps «Aceptar y empezar a
  cocinar» disabled until the trainee taps the red tag (`ack-restriction`). This is a training exercise: the real till never
  blocks. The Reto Almuerzo uses the same rule, so each ticket costs the same number of taps as before.
- **Practice tickets use real catalog modifier ids** (`PRACTICE_MODIFIERS` in `simulator.js`). The ticket's header chips are found by
  id, so a copy with another id would show no chip; a test pins every copy to `shared/realtime/catalog.js`.
- **`tiempos` backdates its tickets** and orders them oldest first in each lane, because a step spotlights the first matching
  button. The tickets sit at least 90 s inside their colour window so nothing changes colour under the trainee.
- **Practice tables live in the practice board** (`createPracticeTables`), one of them already seated. Tapping them never sends a command.
- **`transferencia` does not ask the trainee to tap «Copiar CLABE»:** copying can fail silently and belongs to the customer.

### Guard tests

`tests/academy-engine.test.js` also fails when a lesson could strand a trainee: a step whose `target` is not rendered by any screen, a step
that waits for an event nothing emits, or a `data-help` control with no glossary entry (explore mode would show nothing). The first
two catch exactly the failure the replay test cannot, because the replay hands the reducer the expected event directly.

## 3. What each step does

A step is `{id, kind, target, control?, title, instruction, consequence?, why?, expect?, view?, typing?}`.

- **Explain before execute.** An `act` step spotlights one control and holds it behind a 2-second read lock
  (`EXPLAIN_SECONDS`). The card shows the instruction, «En el sistema» (the consequence) and «Por qué importa».
- **Shadow-click guard.** A capture-phase click handler on the board swallows taps on anything that is not the
  spotlighted control (or an element marked `data-tour-allow`) and shows «Aún no. Termina el paso actual primero.».
  Wrong taps get a thud and a vibration; right ones a chime.
- **Hesitation pulse.** After `HESITATION_MS` (5 s) idle on the target, the cutout pulses.
- **Explore mode** (compass in the bar): tap any control that has a `data-help` id to read what it does, without
  running it. Both modes read the same glossary.
- **Glossary** (book in the bar): every button, grouped, with purpose, effect, why, and what to watch for.

`glossary.js` is the single source for all three. A step's `control` pulls its consequence and why from there unless
the step overrides them.

## 4. Isolation guarantees

- The reducer in `engine.js` is pure JS: no React, timers, storage or sockets. Every path can be replayed in a unit test.
- Practice data lives in `usePracticeBoard`. Starting practice suspends the realtime connection (the last live
  snapshot is retained, not nulled); practice code never emits a socket command and never reads or writes the data dir.
- All timers, observers and the realtime resume are cleaned up on unmount.

## 5. Adding or changing a module

1. Add an object to `MODULES` in `curriculum.js`: `id`, `number`, `title`, `subtitle`, `description`, `required`, `minutes`,
   `takeaways` (the recap bullets), `quiz` (`question` and `options`) and `steps`. Add the id to the `ModuleId` typedef;
   `MODULE_ORDER` and `REQUIRED_MODULES` are derived from `MODULES`.
2. Give each step a `data-tour-target` that exists in the UI, and an `expect` event the UI emits. If the control is new,
   add a glossary entry and a `data-help` attribute.
3. If the module needs special tickets, add a builder to `simulator.js` and a test beside the existing ones.
4. Run `npm test`. `academy-engine.test.js` replays every module end to end and runs a **truth test**: every
   «quoted» button label or customer message in the training text must exist in the app source, so the Academy cannot
   teach a label that does not exist.

Writing rules: say only what the real app does, use the exact printed label, keep sentences short enough to read in a few
seconds with greasy hands.

## 6. Layering (z-index manifesto)

Semantic classes in `shared/ui/styles.css` (plain CSS, because Tailwind only scans some folders):

| Class                 | z   | Used for                                               |
| --------------------- | --- | ------------------------------------------------------ |
| `z-layer-board`       | 10  | board content                                          |
| `z-layer-sticky`      | 20  | sticky tabs and headers                                |
| `z-layer-dock`        | 30  | bottom bars (customer cart)                            |
| `z-layer-overlay`     | 40  | dimmers                                                |
| `z-layer-modal`       | 50  | dialogs (training dialogs render inline at this level) |
| `z-layer-academy`     | 70  | spotlight, coach card, Academy bar                     |
| `z-layer-academy-top` | 75  | module menu, question, recap, rush result              |
| `z-layer-system`      | 100 | offline banner, toasts, fatal errors, confetti         |

A native `<dialog>` opened with `showModal()` lives in the browser top layer, above every z-index, so training screens
use `Modal layer="inline"` instead; otherwise the coach card could never sit above a dialog it is explaining.

The spotlight is one fixed element (`.academy-cutout`) whose huge outer shadow dims everything else, so the target
itself is never dimmed or covered, and it ignores the pointer except for the 2-second read lock. The coach card docks
to the screen edge farthest from the target, or into the dialog's sticky header when the target is inside a dialog.
The Academy bar publishes its height as `--academy-bar-h` (after every render, plus a `ResizeObserver`) so sticky elements and
dialogs stay clear of it.

Scrolling a target into view follows three rules, all in `CoachmarkSpotlight.tsx`:

- **Sticky strips are cleared.** A sticky strip pinned under the bar (the phone lane tabs) carries `data-sticky-inset`, and a
  target is scrolled below it, not just below the bar.
- **Layout shifts are corrected, scrolling is not.** If the target's position _within its content_ changes (a summary card
  appears above it, the coach card mounts in a dialog header), the spotlight scrolls again, at most six times per step.
  Scrolling by the person never triggers this, so a touch fling or a scrollbar drag is never pulled back.
- **A tall target never chases.** A target taller than the free band is left alone.

Native `<dialog>` elements are centered by `margin: auto` in `shared/ui/styles.css`; Tailwind's reset zeroes margins and would
otherwise pin every dialog (inventory, payment, install help) to the top-left corner.

## 7. Storage keys

| Key                         | Value                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `masaflow_trained`          | `"true"` only after graduation (a legacy `"true"` migrates to the first five modules done) |
| `masaflow_academy_progress` | `{v: 1, completed: ModuleId[], rushPassed: boolean}`                                       |
| `masaflow_training_skipped` | ISO date of an emergency skip                                                              |
