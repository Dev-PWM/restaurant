import { ArrowRight, Building2, Coins, Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type {
  OrderInput,
  PaymentMethod,
} from "../../../../shared/types/realtime";
import { useRealtime } from "../../../../shared/ui/RealtimeProvider";
import { summarizeCart } from "../../../../shared/ui/cart-summary.js";
import { Modal, mxn } from "../../../../shared/ui/components";

type CartLine = OrderInput["items"][number];

export function CartDrawer({
  cart,
  setCart,
  onClose,
  onSubmit,
  name,
  setName,
  payment,
  setPayment,
  busy,
  pending,
  connected,
}: {
  cart: CartLine[];
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>;
  onClose: () => void;
  onSubmit: () => void;
  name: string;
  setName: (name: string) => void;
  payment: PaymentMethod;
  setPayment: (payment: PaymentMethod) => void;
  busy: boolean;
  pending: OrderInput | null;
  connected: boolean;
}) {
  const { snapshot } = useRealtime();
  const [nameError, setNameError] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  if (!snapshot) return null;

  const cartSummary = summarizeCart(
    cart,
    snapshot.menuItems,
    snapshot.modifiers,
  );
  const totalCents = cartSummary.totalCents;

  const updateQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) {
      setCart((prev) => prev.filter((_, i) => i !== index));
    } else {
      setCart((prev) =>
        prev.map((line, i) =>
          i === index ? { ...line, quantity: newQty } : line,
        ),
      );
    }
  };

  const validCart =
    cart.length > 0 &&
    cart.every((line) => {
      const item = snapshot.menuItems.find((m) => m.id === line.menuItemId);
      return (
        item &&
        item.available &&
        line.modifierIds.every(
          (id) => snapshot.modifiers.find((m) => m.id === id)?.available,
        )
      );
    });

  return (
    <Modal title="Tu Comanda de Antojitos" onClose={onClose}>
      <div className="space-y-3.5">
        {cartSummary.lines.map(
          ({ line, item: menuItem, key, index, lineTotalCents }) => {
            const lineMods = line.modifierIds
              .map((id) => snapshot.modifiers.find((m) => m.id === id))
              .filter(Boolean);

            const chipMods = lineMods.filter(
              (m) => m?.kind === "masa" || m?.kind === "prep",
            );
            const otherMods = lineMods.filter(
              (m) => m?.kind !== "masa" && m?.kind !== "prep",
            );

            return (
              <div
                key={key}
                className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-stone-900 font-bold">
                        {menuItem?.name || "Platillo"}
                      </strong>
                      {chipMods.map((mod) => (
                        <span
                          key={mod?.id}
                          className="rounded bg-white px-2 py-0.5 border border-stone-200 text-xs font-semibold text-stone-700"
                        >
                          {mod?.name}
                        </span>
                      ))}
                    </div>

                    {otherMods.length > 0 && (
                      <p className="mt-1 text-xs text-stone-500">
                        {otherMods.map((m) => m?.name).join(" · ")}
                      </p>
                    )}
                  </div>

                  <button
                    className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-700"
                    disabled={busy || Boolean(pending)}
                    aria-label={`Quitar platillo ${index + 1}`}
                    onClick={() =>
                      setCart((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-stone-200/60 pt-2.5">
                  <div className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white p-0.5">
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded text-stone-600 hover:bg-stone-100 disabled:opacity-30"
                      disabled={busy}
                      onClick={() => updateQuantity(index, line.quantity - 1)}
                      aria-label="Disminuir cantidad"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="w-6 text-center text-xs font-bold tabular-nums">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded text-stone-600 hover:bg-stone-100 disabled:opacity-30"
                      disabled={busy}
                      onClick={() => updateQuantity(index, line.quantity + 1)}
                      aria-label="Aumentar cantidad"
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  <span className="font-bold text-sm text-stone-900 tabular-nums">
                    {mxn(lineTotalCents)} MXN
                  </span>
                </div>
              </div>
            );
          },
        )}
      </div>

      {/* Subtotal & Total */}
      <div className="my-5 flex items-center justify-between border-t border-stone-200 pt-4">
        <span className="text-base font-bold text-stone-800">
          Total a pagar
        </span>
        <strong className="text-2xl font-bold text-clay-950 tabular-nums">
          {mxn(totalCents)} MXN
        </strong>
      </div>

      {/* Customer Name */}
      <label className="block text-sm font-bold text-stone-800">
        ¿A nombre de quién sale la orden?
        <input
          key={shakeKey}
          className={`field mt-1.5 w-full text-base font-semibold ${nameError ? "animate-shake" : ""}`}
          aria-invalid={nameError}
          aria-describedby={nameError ? "customer-name-error" : undefined}
          placeholder="Ej. Juan, María, Don Pedro…"
          autoComplete="given-name"
          maxLength={60}
          value={name}
          disabled={busy || Boolean(pending)}
          onChange={(e) => {
            setName(e.target.value);
            if (e.target.value.trim()) setNameError(false);
          }}
        />
        <span className="mt-1 block text-xs text-stone-500 font-normal">
          Con este nombre te llamaremos en el mostrador cuando esté listo.
        </span>
      </label>
      {nameError && (
        <p
          id="customer-name-error"
          role="alert"
          className="mt-2 text-sm font-semibold text-red-700"
        >
          Escribe el nombre para identificar tu pedido.
        </p>
      )}

      {!validCart && (
        <p
          role="alert"
          className="my-3 rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-800"
        >
          Un producto de tu carrito se encuentra agotado. Por favor ajústalo
          antes de enviar.
        </p>
      )}

      {/* Payment at pickup: the customer says how; the cashier records what really happens. */}
      <fieldset
        className="my-4"
        disabled={busy || Boolean(pending)}
        data-testid="payment-choice"
      >
        <legend className="mb-2 text-sm font-bold text-stone-800">
          ¿Cómo vas a pagar al recoger?
        </legend>
        <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
          {(
            [
              { value: "cash", label: "Efectivo", Icon: Coins },
              { value: "spei", label: "Transferencia SPEI", Icon: Building2 },
            ] as const
          ).map(({ value, label, Icon }) => (
            <label
              key={value}
              className={`flex min-h-14 cursor-pointer items-center gap-2.5 rounded-xl border-2 p-3 text-sm font-bold transition-colors ${
                payment === value
                  ? "border-clay-600 bg-clay-50 text-clay-900"
                  : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
              }`}
            >
              <input
                type="radio"
                name="payment"
                value={value}
                checked={payment === value}
                onChange={() => setPayment(value)}
                className="h-4 w-4 text-clay-600 focus:ring-0"
              />
              <Icon size={16} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <p className="mt-2.5 rounded-xl border border-amber-300 bg-amber-50/80 p-3 text-xs leading-relaxed text-stone-700">
          {payment === "spei"
            ? "Al enviar tu pedido verás los datos del banco, el monto exacto y tu referencia. Haz la transferencia y muestra el comprobante en el mostrador: el cajero la verifica antes de entregarte."
            : "El negocio revisará tu pedido y, si lo acepta, comenzará a prepararlo. Paga en efectivo en el mostrador al recogerlo."}
        </p>
      </fieldset>

      <button
        className="btn btn-primary w-full py-3.5 text-base font-bold shadow-sm"
        disabled={!connected || busy || (!pending && !validCart)}
        onClick={() => {
          if (!pending && !name.trim()) {
            setNameError(true);
            setShakeKey((key) => key + 1);
            return;
          }
          onSubmit();
        }}
      >
        {busy ? (
          "Enviando al comal…"
        ) : pending ? (
          "Verificar y reintentar"
        ) : (
          <span className="flex items-center justify-center gap-2">
            <span>Confirmar y Pedir al Mostrador</span>
            <ArrowRight size={18} />
          </span>
        )}
      </button>
    </Modal>
  );
}
