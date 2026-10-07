export const money = (n) =>
  Number(n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export const shortId = (id) => (id ? id.slice(0, 8).toUpperCase() : '—');

export const dateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

/**
 * Parse an itemized bill from either a JSON array or plain text lines.
 * Text formats accepted per line: "Item name, 1234.50" | "Item name - 1234" | "Item name: $1,234"
 */
export function parseBill(input) {
  const text = String(input || '').trim();
  if (!text) return { items: [], error: 'Itemized bill is required.' };

  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      let data = JSON.parse(text);
      if (!Array.isArray(data)) data = data.items || data.raw_bill_data || [];
      const items = data.map((it, i) => {
        const item_name = String(it.item_name ?? it.name ?? it.description ?? '').trim();
        const cost = Number(it.cost ?? it.amount ?? it.price);
        if (!item_name) throw new Error(`Line ${i + 1}: missing item_name`);
        if (!Number.isFinite(cost) || cost <= 0) throw new Error(`Line ${i + 1}: cost must be a positive number`);
        return { item_name, cost: Math.round(cost * 100) / 100 };
      });
      if (!items.length) return { items: [], error: 'Bill has no line items.' };
      return { items, error: null };
    } catch (e) {
      return { items: [], error: `Invalid JSON: ${e.message}` };
    }
  }

  const items = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(.*?)[\s]*[,:\-–|\t][\s]*\$?\s*([\d,]+(?:\.\d+)?)\s*$/);
    if (!m) return { items: [], error: `Line ${i + 1}: expected "Item name, cost"` };
    const cost = Number(m[2].replace(/,/g, ''));
    if (!m[1].trim() || !(cost > 0)) return { items: [], error: `Line ${i + 1}: invalid item or cost` };
    items.push({ item_name: m[1].trim(), cost: Math.round(cost * 100) / 100 });
  }
  return { items, error: items.length ? null : 'Bill has no line items.' };
}
