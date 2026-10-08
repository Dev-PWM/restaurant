import { Modal, ToggleSwitch } from "../../../../shared/ui/components";
import type { PracticeInventoryItem } from "./types";

/**
 * Practice twin of the real «Inventario» window: same title, same wording and the same
 * switches, but it flips local practice data and never sends a command. The dishes are
 * the real menu, so what a trainee learns here is exactly what they will see live.
 */
export function PracticeInventory({
  items,
  practiceItemId,
  onToggle,
  onClose,
}: {
  items: PracticeInventoryItem[];
  /** The dish the walkthrough asks the trainee to switch off. */
  practiceItemId: string | undefined;
  onToggle: (id: string, available: boolean) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Inventario"
      onClose={onClose}
      layer="inline"
      closeTarget="close-inventory"
    >
      <p className="mb-6 text-sm text-stone-600">
        Los cambios aparecen al instante en el menú de tus clientes.
      </p>
      <section className="mb-6">
        <h3 className="eyebrow mb-2">Platillos</h3>
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 border-b border-stone-200 py-3"
          >
            <span className="font-medium">{item.name}</span>
            <ToggleSwitch
              checked={item.available}
              label={`Disponibilidad de ${item.name}`}
              tourTarget={item.id === practiceItemId ? "inv-toggle" : undefined}
              onChange={() => onToggle(item.id, !item.available)}
            />
          </div>
        ))}
      </section>
    </Modal>
  );
}
