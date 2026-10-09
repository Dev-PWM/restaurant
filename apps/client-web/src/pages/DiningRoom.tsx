import { Utensils } from "lucide-react";
import { useRealtime } from "../../../../shared/ui/RealtimeProvider";

/**
 * The dining room as the customer sees it: every table with its state, updated live as staff tap tables on the
 * POS. «banner» sits on the menu so people know before they order; «inline» sits under «Comer aquí» in checkout.
 */
export function DiningRoom({ variant }: { variant: "banner" | "inline" }) {
  const { snapshot } = useRealtime();
  const tables = snapshot?.tables ?? [];
  if (!tables.length) return null;
  const free = tables.filter((table) => table.status === "available").length;
  const summary =
    free === 0
      ? "Sin mesas libres"
      : `${free} de ${tables.length} ${tables.length === 1 ? "mesa libre" : "mesas libres"}`;
  return (
    <section
      className={`dining-room dining-room-${variant}`}
      aria-label="Mesas del comedor"
      data-testid="dining-room"
      data-free={free}
    >
      <div className="dining-room-head">
        <span className="dining-room-title">
          <Utensils size={16} aria-hidden="true" />
          Comedor
        </span>
        <strong aria-live="polite" data-testid="tables-available">
          {summary}
        </strong>
      </div>
      <ul className="dining-room-tables">
        {tables.map((table) => (
          <li key={table.number} data-status={table.status}>
            <span>Mesa {table.number}</span>
            <b>{table.status === "available" ? "Libre" : "Ocupada"}</b>
          </li>
        ))}
      </ul>
      {variant === "inline" && (
        <p className="dining-room-note">Las mesas se actualizan en vivo.</p>
      )}
    </section>
  );
}
