/**
 * Input sanitization and validation helper functions
 */

/**
 * Sanitizes input strings by stripping HTML tags and trimming whitespace.
 */
export function sanitizeString(val: string): string {
  if (!val) return '';
  return val.replace(/<[^>]*>/g, '').trim();
}

/**
 * Validates item name (max 100 chars, no HTML tags/injectable characters like < or >)
 */
export function validateItemName(name: string): string {
  const cleanName = sanitizeString(name);
  if (!cleanName) {
    throw new Error('Item name is required.');
  }
  if (cleanName.length > 100) {
    throw new Error('Item name must be maximum 100 characters.');
  }
  if (name.includes('<') || name.includes('>')) {
    throw new Error('Invalid characters in Item Name. HTML tags are not allowed.');
  }
  // Normalize string to Title Case to resolve casing mismatches (e.g. BEANS, Beans, beans -> Beans)
  return cleanName
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Validates general description/notes (max 500 chars, no HTML tags/injectable characters like < or >)
 */
export function validateNotes(notes: string): string {
  if (!notes) return '';
  const cleanNotes = sanitizeString(notes);
  if (cleanNotes.length > 500) {
    throw new Error('Notes/Description must be maximum 500 characters.');
  }
  if (notes.includes('<') || notes.includes('>')) {
    throw new Error('Invalid characters in Notes/Description. HTML tags are not allowed.');
  }
  return cleanNotes;
}

/**
 * Validates quantities (positive numbers only)
 */
export function validateQuantity(quantity: number): number {
  if (isNaN(quantity) || quantity <= 0) {
    throw new Error('Quantity must be a positive number.');
  }
  if (!isFinite(quantity)) {
    throw new Error('Quantity must be a finite number.');
  }
  return quantity;
}
