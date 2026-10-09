/**
 * Page translators (Chrome Translate, Edge) replace every text node React rendered with
 * `<font><font>translated text</font></font>`. React still points at the original, now detached, text node, so
 * its next `insertBefore` / `removeChild` throws `NotFoundError`. With nothing to catch that, the whole app
 * unmounts: a white page until someone reloads. Tapping a table or any button that swaps an icon-plus-text label
 * is enough to trigger it.
 *
 * Switching translation off would take the English view away from people who need it, so this keeps it working:
 * it remembers which wrapper replaced which text node, and when React touches the original it acts on the wrapper
 * instead (removes it, inserts before it, or writes the new text into it). The fast path is untouched: a node
 * that is still where React left it goes straight to the browser's own method.
 */
const wrappers = new WeakMap<Node, Element>();
let installed = false;

const isFont = (node: Node | null): node is Element => node?.nodeName === "FONT";

/** The innermost `<font>`, which holds the visible text of a translated node. */
function innermost(wrapper: Element): Element {
  let element = wrapper;
  while (element.childNodes.length === 1 && isFont(element.firstChild))
    element = element.firstChild;
  return element;
}

export function installTranslationGuard(): void {
  if (installed || typeof window === "undefined" || typeof MutationObserver === "undefined")
    return;
  installed = true;
  const proto = Node.prototype;
  const { removeChild, insertBefore } = proto;
  const nodeValue = Object.getOwnPropertyDescriptor(proto, "nodeValue");

  // A translator swaps a text node either in one replaceChild or as insert-the-wrapper-then-remove-the-text.
  // Both leave the wrapper in the same place, so look for it among what was added, then beside what was removed.
  new MutationObserver((records) => {
    for (const record of records) {
      if (!record.removedNodes.length) continue;
      for (const removed of Array.from(record.removedNodes)) {
        if (removed.nodeType !== Node.TEXT_NODE) continue;
        const wrapper =
          Array.from(record.addedNodes).find(isFont) ??
          (isFont(record.previousSibling) ? record.previousSibling : null) ??
          (isFont(record.nextSibling) ? record.nextSibling : null);
        if (wrapper) wrappers.set(removed, wrapper);
      }
    }
  }).observe(document, { childList: true, subtree: true });

  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode === this) return removeChild.call(this, child) as T;
    // React is removing text the translator already replaced: remove what the user actually sees.
    const wrapper = wrappers.get(child);
    if (wrapper?.parentNode === this) removeChild.call(this, wrapper);
    return child;
  };

  proto.insertBefore = function <T extends Node>(
    this: Node,
    node: T,
    reference: Node | null,
  ): T {
    if (reference && reference.parentNode !== this) {
      const wrapper = wrappers.get(reference);
      // Insert in front of the wrapper that took its place; if even that is gone, add it at the end.
      reference = wrapper?.parentNode === this ? wrapper : null;
    }
    return insertBefore.call(this, node, reference) as T;
  };

  if (nodeValue?.set)
    Object.defineProperty(proto, "nodeValue", {
      ...nodeValue,
      set(this: Node, value: string | null) {
        nodeValue.set!.call(this, value);
        // React updates a text node that is detached: show the new text where the translator put the old one.
        if (this.nodeType === Node.TEXT_NODE && !this.parentNode) {
          const wrapper = wrappers.get(this);
          if (wrapper) innermost(wrapper).textContent = value ?? "";
        }
      },
    });
}
