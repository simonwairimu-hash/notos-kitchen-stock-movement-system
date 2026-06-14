import { collection, query, where, getDocs, orderBy, limit, startAfter } from 'firebase/firestore';
import { db } from '../config/firebase';
import * as XLSX from 'xlsx';
import { Parser } from 'json2csv';

/**
 * Generic pagination helper. The caller provides a Firestore query and the current page
 * cursor (the last document from the previous page). The function returns the data and
 * a new cursor for the next page.
 */
export async function fetchPaginated<T>(q: any, pageSize: number, lastDoc?: any): Promise<{data: T[]; lastDoc: any | null}> {
  let finalQuery = q;
  if (lastDoc) {
    finalQuery = query(q, startAfter(lastDoc));
  }
  finalQuery = query(finalQuery, orderBy('__name__'), limit(pageSize));
  const snapshot = await getDocs(finalQuery);
  const data = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) } as T));
  const newLast = snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : null;
  return { data, lastDoc: newLast };
}

/**
 * Inventory Report – includes all items for a store.
 */
export async function fetchInventoryReport(storeId: string, pageSize = 100, lastDoc?: any) {
  const q = query(collection(db, 'inventory'), where('storeId', '==', storeId));
  return fetchPaginated<any>(q, pageSize, lastDoc);
}

/**
 * Daily Stock Movement Report – uses the transactions collection.
 */
export async function fetchMovementReport(storeId: string, startDate: Date, endDate: Date, pageSize = 100, lastDoc?: any) {
  const q = query(
    collection(db, 'transactions'),
    where('storeId', '==', storeId),
    where('timestamp', '>=', startDate),
    where('timestamp', '<=', endDate)
  );
  return fetchPaginated<any>(q, pageSize, lastDoc);
}

/**
 * Low Stock Report – items where remainingStock < minimumStock.
 */
export async function fetchLowStockReport(storeId: string, pageSize = 100, lastDoc?: any) {
  const q = query(
    collection(db, 'inventory'),
    where('storeId', '==', storeId)
  );
  const { data, lastDoc: newLast } = await fetchPaginated<any>(q, pageSize, lastDoc);
  const filtered = data.filter((item) => item.quantity <= item.minStockLevel);
  return { data: filtered, lastDoc: newLast };
}

/**
 * Damage Report – transactions with type 'damaged'.
 */
export async function fetchDamageReport(storeId: string, pageSize = 100, lastDoc?: any) {
  const q = query(collection(db, 'transactions'), where('storeId', '==', storeId), where('type', '==', 'damaged'));
  return fetchPaginated<any>(q, pageSize, lastDoc);
}

/**
 * Requisition Report – from requisitions collection.
 */
export async function fetchRequisitionReport(storeId: string, pageSize = 100, lastDoc?: any) {
  const q = query(collection(db, 'requisitions'), where('storeId', '==', storeId));
  return fetchPaginated<any>(q, pageSize, lastDoc);
}

/**
 * Admin Multi‑Store Report – aggregates across all stores.
 */
export async function fetchAdminMultiStoreReport(pageSize = 100, lastDoc?: any) {
  const q = query(collection(db, 'inventory'));
  return fetchPaginated<any>(q, pageSize, lastDoc);
}

/**
 * Export helpers – generate a Blob and trigger download.
 */
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToExcel(data: any[], sheetName: string, filename: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  // Apply simple styling – bold header row.
  const range = XLSX.utils.decode_range(ws['!ref']!);
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const address = XLSX.utils.encode_cell({ r: 0, c: C });
    if (ws[address]) ws[address].s = { font: { bold: true } };
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  // Freeze first row.
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  triggerDownload(blob, filename);
}

export function exportToCsv(data: any[], filename: string) {
  const parser = new Parser({ fields: Object.keys(data[0] || {}), delimiter: ',' });
  const csv = parser.parse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}
