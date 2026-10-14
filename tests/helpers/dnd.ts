/**
 * Native HTML drag and drop for UI tests and story play functions: neither Testing Library's
 * fireEvent nor userEvent carries a DataTransfer through a whole drag. Works in jsdom (which has
 * no DataTransfer, so a stand-in is used) and in a real browser.
 */
export interface TestDataTransfer extends DataTransfer {
  /** Everything set with setData, by type. */
  readonly data: Record<string, string>;
}

class DataTransferStandIn {
  readonly data: Record<string, string> = {};
  readonly types: string[] = [];
  effectAllowed: DataTransfer['effectAllowed'] = 'all';
  dropEffect: DataTransfer['dropEffect'] = 'none';
  setData(type: string, value: string) {
    this.data[type] = value;
    if (!this.types.includes(type)) this.types.push(type);
  }
  getData = (type: string) => this.data[type] ?? '';
  setDragImage() {}
}

export function createDataTransfer(): TestDataTransfer {
  if (typeof DataTransfer !== 'function') {
    return new DataTransferStandIn() as unknown as TestDataTransfer;
  }
  // A real DataTransfer, with a record of what was set (it hides data outside a real drag).
  const transfer = new DataTransfer();
  const data: Record<string, string> = {};
  const setData = transfer.setData.bind(transfer);
  transfer.setData = (type, value) => {
    data[type] = value;
    setData(type, value);
  };
  return Object.assign(transfer, { data });
}

/** Dispatches a drag event carrying `transfer`; returns false when a handler prevented it. */
export function fireDrag(element: Element, type: string, transfer: DataTransfer): boolean {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  return element.dispatchEvent(event);
}

/**
 * Drags `source` onto `target` like a user would. The drop only happens when the target
 * accepts it (cancels dragover). Returns whether it did, and the DataTransfer used.
 */
export function dragAndDrop(
  source: Element,
  target: Element,
): { accepted: boolean; transfer: TestDataTransfer } {
  const transfer = createDataTransfer();
  fireDrag(source, 'dragstart', transfer);
  fireDrag(target, 'dragenter', transfer);
  const accepted = !fireDrag(target, 'dragover', transfer);
  if (accepted) fireDrag(target, 'drop', transfer);
  else fireDrag(target, 'dragleave', transfer);
  fireDrag(source, 'dragend', transfer);
  return { accepted, transfer };
}
