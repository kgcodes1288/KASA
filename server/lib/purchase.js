// Purchase requests: a co-host asks the owner to approve buying things for the property.
// Either the co-host buys them (and is reimbursed through an invoice) or the owner orders them for delivery.

const MODES = ['COHOST_BUYS', 'OWNER_ORDERS'];
const FINAL = ['DECLINED', 'PURCHASED', 'RECEIVED'];

const toNum = (v) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : null; };
const fmtMoney = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

// [{ name, qty, price?, link? }] as typed -> clean list, or { error }
function cleanItems(items) {
  if (!Array.isArray(items) || items.length === 0) return { error: 'Add at least one item' };
  if (items.length > 20) return { error: 'A request can have up to 20 items' };
  const out = [];
  for (const it of items) {
    const name = String(it?.name ?? '').trim();
    if (!name || name.length > 100) return { error: 'Each item needs a name (up to 100 characters)' };
    const qty = it.qty === undefined || it.qty === '' || it.qty === null ? 1 : Number(it.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) return { error: `Quantity for "${name}" must be a whole number from 1 to 99` };
    let price = null;
    if (it.price !== undefined && it.price !== null && String(it.price).trim() !== '') {
      const t = String(it.price).replace(/[$,\s]/g, '');
      if (!/^\d{1,6}(\.\d{1,2})?$/.test(t) || !(parseFloat(t) > 0)) return { error: `Enter a valid price for "${name}", like 12 or 12.99` };
      price = t;
    }
    let link = null;
    if (it.link && String(it.link).trim()) {
      link = String(it.link).trim();
      if (link.length > 500 || !/^https?:\/\/[^\s]+$/i.test(link)) return { error: `The link for "${name}" should be a web address starting with https://` };
    }
    out.push({ name, qty, price, link });
  }
  return { value: out };
}

// estimated total of the items that have a price (null when none do)
function itemsTotal(items) {
  const priced = (items || []).filter((i) => toNum(i.price) !== null);
  if (!priced.length) return null;
  return Math.round(priced.reduce((s, i) => s + toNum(i.price) * (i.qty || 1), 0) * 100) / 100;
}

function itemsSummary(items) {
  const list = (items || []).map((i) => `${i.qty > 1 ? `${i.qty} × ` : ''}${i.name}`);
  return list.length > 3 ? `${list.slice(0, 3).join(', ')} and ${list.length - 3} more` : list.join(', ');
}

function cleanOrderInfo(b) {
  const o = {};
  for (const k of ['store', 'orderNumber']) {
    if (b?.[k] !== undefined && String(b[k]).trim()) {
      const v = String(b[k]).trim();
      if (v.length > 100) return { error: 'Store and order number must be 100 characters or fewer' };
      o[k] = v;
    }
  }
  if (b?.trackingUrl && String(b.trackingUrl).trim()) {
    const v = String(b.trackingUrl).trim();
    if (v.length > 500 || !/^https?:\/\/[^\s]+$/i.test(v)) return { error: 'The tracking link should be a web address starting with https://' };
    o.trackingUrl = v;
  }
  if (b?.eta) {
    if (Number.isNaN(new Date(b.eta).getTime())) return { error: 'That delivery date is not valid' };
    o.eta = new Date(b.eta).toISOString().slice(0, 10);
  }
  return { value: o };
}

module.exports = { MODES, FINAL, toNum, fmtMoney, cleanItems, itemsTotal, itemsSummary, cleanOrderInfo };
