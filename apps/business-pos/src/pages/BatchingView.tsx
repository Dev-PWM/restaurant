import { useMemo, useState } from "react";
import {
  Boxes,
  Check,
  CheckCheck,
  ChefHat,
  Clock3,
  Coffee,
  Flame,
  Layers,
  Printer,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import type { Order } from "../../../../shared/types/realtime";
import {
  EmptyState,
  mxn,
  orderLabel,
  printThermalTicket,
  time,
} from "../../../../shared/ui/components";

type GroupByMode = "station" | "category" | "custom_batch";

interface StationGroup {
  id: string;
  name: string;
  icon: typeof Flame;
  color: string;
  badgeColor: string;
  description: string;
  items: {
    key: string;
    name: string;
    category: string;
    totalQuantity: number;
    details: {
      orderId: string;
      orderNumber: number;
      customerName: string;
      quantity: number;
      masa: string;
      extras: string[];
      omits: string[];
    }[];
  }[];
}

interface CategoryGroup {
  category: string;
  totalItems: number;
  orders: {
    order: Order;
    lineItems: Order["items"];
  }[];
}

export function BatchingView({
  orders,
  command,
  connected,
}: {
  orders: Order[];
  command: (
    cmd: "pos_update_status",
    args: { orderId: string; status: "ready" | "completed" },
  ) => Promise<{ ok: boolean; error?: string }>;
  connected: boolean;
}) {
  const [groupBy, setGroupBy] = useState<GroupByMode>("station");
  const [statusFilter, setStatusFilter] = useState<"cooking" | "all_active">(
    "cooking",
  );
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(
    new Set(),
  );
  const [batchBusy, setBatchBusy] = useState(false);

  // Filter relevant orders
  const activeOrders = useMemo(() => {
    return orders.filter((o) =>
      statusFilter === "cooking"
        ? o.status === "cooking"
        : o.status === "cooking" || o.status === "unpaid",
    );
  }, [orders, statusFilter]);

  // 1. Group by Preparation Station
  const stationGroups = useMemo<StationGroup[]>(() => {
    const comalItems: StationGroup["items"] = [];
    const fillingsItems: StationGroup["items"] = [];
    const beverageItems: StationGroup["items"] = [];

    const itemMap = new Map<
      string,
      {
        key: string;
        name: string;
        category: string;
        totalQuantity: number;
        station: "comal" | "fillings" | "beverage";
        details: StationGroup["items"][0]["details"];
      }
    >();

    for (const order of activeOrders) {
      for (const line of order.items) {
        const masa =
          line.modifiers.find((m) => m.kind === "masa")?.name || "Estándar";
        const extras = line.modifiers
          .filter((m) => m.kind === "extra")
          .map((m) => m.name);
        const omits = line.modifiers
          .filter((m) => m.kind === "omit")
          .map((m) => m.name);

        const isDrink =
          line.name.toLowerCase().includes("agua") ||
          line.name.toLowerCase().includes("refresco") ||
          line.name.toLowerCase().includes("bebida") ||
          line.name.toLowerCase().includes("jugo");

        const station: "comal" | "fillings" | "beverage" = isDrink
          ? "beverage"
          : "comal";

        const mapKey = `${station}:${line.name}`;
        const existing = itemMap.get(mapKey) || {
          key: mapKey,
          name: line.name,
          category: isDrink ? "Bebidas" : "Comal",
          totalQuantity: 0,
          station,
          details: [],
        };

        existing.totalQuantity += line.quantity;
        existing.details.push({
          orderId: order.id,
          orderNumber: order.number,
          customerName: order.customerName,
          quantity: line.quantity,
          masa,
          extras,
          omits,
        });

        itemMap.set(mapKey, existing);
      }
    }

    // Populate stations
    for (const item of itemMap.values()) {
      if (item.station === "comal") {
        comalItems.push(item);
      } else if (item.station === "beverage") {
        beverageItems.push(item);
      }
    }

    // Generate fillings and omits summary
    const toppingsMap = new Map<
      string,
      { name: string; total: number; orders: number[] }
    >();
    for (const order of activeOrders) {
      for (const line of order.items) {
        for (const mod of line.modifiers) {
          if (mod.kind === "extra" || mod.kind === "omit") {
            const prefix = mod.kind === "omit" ? "Sin" : "Con";
            const name = `${prefix} ${mod.name.replace(/^no-/i, "")}`;
            const cur = toppingsMap.get(name) || {
              name,
              total: 0,
              orders: [],
            };
            cur.total += line.quantity;
            if (!cur.orders.includes(order.number)) {
              cur.orders.push(order.number);
            }
            toppingsMap.set(name, cur);
          }
        }
      }
    }

    for (const [key, topping] of toppingsMap.entries()) {
      fillingsItems.push({
        key: `fillings:${key}`,
        name: topping.name,
        category: "Rellenos / Modificadores",
        totalQuantity: topping.total,
        details: topping.orders.map((num) => ({
          orderId: String(num),
          orderNumber: num,
          customerName: "",
          quantity: 1,
          masa: "",
          extras: [],
          omits: [],
        })),
      });
    }

    return [
      {
        id: "comal",
        name: "Estación Comal y Masa",
        icon: Flame,
        color: "border-orange-300 bg-orange-50/60 text-orange-950",
        badgeColor: "bg-orange-600 text-white",
        description:
          "Antojitos y piezas de masa en cocción sobre la plancha caliente.",
        items: comalItems.sort((a, b) => b.totalQuantity - a.totalQuantity),
      },
      {
        id: "fillings",
        name: "Mesa de Preparación y Rellenos",
        icon: UtensilsCrossed,
        color: "border-amber-300 bg-amber-50/60 text-amber-950",
        badgeColor: "bg-amber-600 text-white",
        description:
          "Guisados, porciones de queso, aguacate y exclusiones de clientes.",
        items: fillingsItems.sort((a, b) => b.totalQuantity - a.totalQuantity),
      },
      {
        id: "beverage",
        name: "Estación de Bebidas y Barra",
        icon: Coffee,
        color: "border-cyan-300 bg-cyan-50/60 text-cyan-950",
        badgeColor: "bg-cyan-700 text-white",
        description:
          "Aguas frescas, refrescos y bebidas para servir en lote.",
        items: beverageItems.sort((a, b) => b.totalQuantity - a.totalQuantity),
      },
    ];
  }, [activeOrders]);

  // 2. Group by Category / Ticket Type
  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    const catMap = new Map<string, CategoryGroup>();

    for (const order of activeOrders) {
      for (const line of order.items) {
        // Derive category or use item name group
        const category = line.name.split(" ")[0] || "Varios";
        const cur = catMap.get(category) || {
          category,
          totalItems: 0,
          orders: [],
        };
        cur.totalItems += line.quantity;

        const existingOrder = cur.orders.find((o) => o.order.id === order.id);
        if (existingOrder) {
          existingOrder.lineItems.push(line);
        } else {
          cur.orders.push({
            order,
            lineItems: [line],
          });
        }
        catMap.set(category, cur);
      }
    }

    return Array.from(catMap.values()).sort(
      (a, b) => b.totalItems - a.totalItems,
    );
  }, [activeOrders]);

  // Toggle item prep checkbox
  const toggleCheck = (key: string) => {
    setCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Toggle order selection for ad-hoc batching
  const toggleOrderSelection = (id: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Select all cooking orders
  const selectAllCooking = () => {
    const cookingIds = activeOrders
      .filter((o) => o.status === "cooking")
      .map((o) => o.id);
    setSelectedOrderIds(new Set(cookingIds));
  };

  // Advance a batch of orders to "ready"
  const markBatchReady = async (orderIds: string[]) => {
    if (!orderIds.length || batchBusy) return;
    setBatchBusy(true);
    try {
      for (const id of orderIds) {
        await command("pos_update_status", { orderId: id, status: "ready" });
      }
      // Clear selection
      setSelectedOrderIds((prev) => {
        const next = new Set(prev);
        orderIds.forEach((id) => next.delete(id));
        return next;
      });
    } finally {
      setBatchBusy(false);
    }
  };

  const totalCookingPieces = activeOrders
    .filter((o) => o.status === "cooking")
    .reduce(
      (sum, o) =>
        sum + o.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0,
    );

  return (
    <div className="space-y-6">
      {/* Batching Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-stone-500 mr-1">
            Agrupar por:
          </span>
          <button
            className={`btn text-xs font-bold transition-colors ${
              groupBy === "station"
                ? "border-clay-600 bg-clay-50 text-clay-900"
                : "border-stone-200 text-stone-600"
            }`}
            onClick={() => setGroupBy("station")}
          >
            <Flame size={14} className="text-orange-600" />
            <span>Estaciones de Preparación</span>
          </button>
          <button
            className={`btn text-xs font-bold transition-colors ${
              groupBy === "category"
                ? "border-clay-600 bg-clay-50 text-clay-900"
                : "border-stone-200 text-stone-600"
            }`}
            onClick={() => setGroupBy("category")}
          >
            <Boxes size={14} className="text-clay-600" />
            <span>Tipo de Platillo</span>
          </button>
          <button
            className={`btn text-xs font-bold transition-colors ${
              groupBy === "custom_batch"
                ? "border-clay-600 bg-clay-50 text-clay-900"
                : "border-stone-200 text-stone-600"
            }`}
            onClick={() => setGroupBy("custom_batch")}
          >
            <Layers size={14} className="text-emerald-700" />
            <span>Lotes por Boleto ({selectedOrderIds.size})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-stone-600">
            <span>Filtro:</span>
            <select
              className="field h-8 py-0 text-xs font-semibold"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "cooking" | "all_active")
              }
            >
              <option value="cooking">Solo Cocinando ({activeOrders.filter((o) => o.status === "cooking").length})</option>
              <option value="all_active">Cocinando + Por Pagar ({activeOrders.length})</option>
            </select>
          </div>

          <div className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-950">
            {totalCookingPieces} {totalCookingPieces === 1 ? "pieza" : "piezas"} al fuego
          </div>
        </div>
      </div>

      {activeOrders.length === 0 ? (
        <EmptyState>
          No hay pedidos activos para agrupar en este momento. Cuando haya comandas en cocina, aquí se consolidarán en lotes.
        </EmptyState>
      ) : groupBy === "station" ? (
        /* 1. Group by Station View */
        <div className="grid gap-6 lg:grid-cols-3">
          {stationGroups.map((station) => {
            const Icon = station.icon;
            const totalStationPieces = station.items.reduce(
              (sum, item) => sum + item.totalQuantity,
              0,
            );

            return (
              <section
                key={station.id}
                className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-xs"
              >
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-clay-100 text-clay-700">
                      <Icon size={18} />
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-stone-900 leading-tight">
                        {station.name}
                      </h3>
                      <p className="text-[11px] text-stone-500">
                        {station.description}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-md bg-stone-100 px-2 py-1 text-xs font-bold text-stone-800">
                    {totalStationPieces} pzas
                  </span>
                </div>

                <div className="mt-4 flex-1 space-y-3">
                  {station.items.length === 0 ? (
                    <p className="py-6 text-center text-xs text-stone-400">
                      Sin pendientes en esta estación.
                    </p>
                  ) : (
                    station.items.map((item) => {
                      const isChecked = Boolean(checkedItems[item.key]);

                      return (
                        <div
                          key={item.key}
                          onClick={() => toggleCheck(item.key)}
                          className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                            isChecked
                              ? "border-emerald-200 bg-emerald-50/50 opacity-75"
                              : "border-stone-200 bg-stone-50 hover:bg-stone-100"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="h-4 w-4 rounded border-stone-300 text-emerald-600 focus:ring-0"
                              />
                              <span
                                className={`text-sm font-bold ${
                                  isChecked
                                    ? "line-through text-stone-400"
                                    : "text-stone-900"
                                }`}
                              >
                                {item.name}
                              </span>
                            </div>
                            <span className="rounded-md bg-stone-900 px-2 py-0.5 text-xs font-black text-white">
                              {item.totalQuantity}×
                            </span>
                          </div>

                          {/* Order ticket badges and masa specs */}
                          <div className="mt-2 flex flex-wrap gap-1.5 pl-6 text-xs">
                            {item.details.map((detail, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 border border-stone-200 text-[11px] text-stone-700"
                              >
                                <strong className="font-bold text-clay-700">
                                  #{detail.orderNumber}
                                </strong>
                                {detail.masa && (
                                  <span className="text-stone-500 font-medium">
                                    · {detail.masa}
                                  </span>
                                )}
                                {detail.omits.length > 0 && (
                                  <span className="text-red-700 font-semibold">
                                    ({detail.omits.join(", ")})
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : groupBy === "category" ? (
        /* 2. Group by Category / Dish Type */
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {categoryGroups.map((group) => {
            const orderIdsInGroup = group.orders
              .filter((o) => o.order.status === "cooking")
              .map((o) => o.order.id);

            return (
              <div
                key={group.category}
                className="panel flex flex-col justify-between border-stone-200 bg-white"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-clay-50 text-clay-700">
                        <Boxes size={18} />
                      </span>
                      <h3 className="text-lg font-bold text-stone-900">
                        {group.category}
                      </h3>
                    </div>
                    <span className="rounded-full bg-clay-100 px-3 py-0.5 text-xs font-black text-clay-800">
                      {group.totalItems} piezas
                    </span>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    {group.orders.map(({ order, lineItems }) => (
                      <div
                        key={order.id}
                        className="rounded-lg bg-stone-50 p-2.5 border border-stone-100 text-xs"
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span className="text-clay-800">
                            {orderLabel(order)} · {order.customerName}
                          </span>
                          <span className="text-stone-400 font-normal">
                            {time(order.createdAt)}
                          </span>
                        </div>
                        <ul className="mt-1.5 space-y-1 text-stone-600">
                          {lineItems.map((item, idx) => (
                            <li key={idx} className="flex justify-between">
                              <span>
                                {item.quantity}× {item.name}{" "}
                                {item.modifiers.length > 0 && (
                                  <span className="text-[11px] text-stone-500">
                                    ({item.modifiers.map((m) => m.name).join(", ")})
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>

                {orderIdsInGroup.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-stone-100 flex gap-2">
                    <button
                      className="btn btn-primary flex-1 text-xs"
                      disabled={!connected || batchBusy}
                      onClick={() => markBatchReady(orderIdsInGroup)}
                    >
                      <CheckCheck size={15} />
                      Marcar lote listo ({orderIdsInGroup.length} pedidos)
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* 3. Custom Ad-hoc Multi-Ticket Batching */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-clay-50 p-4 border border-clay-200">
            <div>
              <h3 className="font-bold text-clay-950 flex items-center gap-2">
                <Layers size={18} />
                <span>Lote Personalizado de Comandas</span>
              </h3>
              <p className="text-xs text-clay-800 mt-0.5">
                Selecciona 2 o más pedidos para prepararlos y despacharlos juntos en un solo lote.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn text-xs font-semibold border-clay-300 bg-white"
                onClick={selectAllCooking}
              >
                Seleccionar todos en cocina
              </button>
              {selectedOrderIds.size > 0 && (
                <>
                  <button
                    className="btn text-xs text-stone-600"
                    onClick={() => setSelectedOrderIds(new Set())}
                  >
                    Deseleccionar
                  </button>
                  <button
                    className="btn btn-primary text-xs"
                    disabled={!connected || batchBusy}
                    onClick={() =>
                      markBatchReady(Array.from(selectedOrderIds))
                    }
                  >
                    <CheckCheck size={16} />
                    Despachar lote ({selectedOrderIds.size} pedidos)
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeOrders.map((order) => {
              const isSelected = selectedOrderIds.has(order.id);

              return (
                <div
                  key={order.id}
                  onClick={() => toggleOrderSelection(order.id)}
                  className={`panel cursor-pointer transition-all ${
                    isSelected
                      ? "ring-2 ring-clay-600 bg-clay-50/30"
                      : "hover:border-stone-300"
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="h-4 w-4 rounded border-stone-300 text-clay-600 focus:ring-0"
                      />
                      <span className="display text-2xl font-bold">
                        {orderLabel(order)}
                      </span>
                    </div>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-bold ${
                        order.status === "cooking"
                          ? "bg-clay-100 text-clay-800"
                          : "bg-stone-100 text-stone-600"
                      }`}
                    >
                      {order.status === "cooking" ? "Cocinando" : "Por pagar"}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-stone-600">
                    <strong className="text-sm font-semibold text-stone-900">
                      {order.customerName}
                    </strong>
                    <span>{time(order.createdAt)}</span>
                  </div>

                  <ul className="mt-3 space-y-1 border-t border-stone-100 pt-2 text-xs text-stone-600">
                    {order.items.map((line, idx) => (
                      <li key={idx} className="flex justify-between">
                        <span>
                          <strong>{line.quantity}×</strong> {line.name}
                        </span>
                        {line.modifiers.find((m) => m.kind === "masa") && (
                          <span className="text-stone-500 font-medium">
                            {
                              line.modifiers.find((m) => m.kind === "masa")
                                ?.name
                            }
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 text-xs">
                    <span className="text-stone-500 font-medium">Total comanda</span>
                    <strong className="text-sm font-bold tabular-nums">
                      {mxn(order.totalCents)}
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
