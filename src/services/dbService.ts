import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  serverTimestamp,
  runTransaction,
  or
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { validateItemName, validateNotes, validateQuantity } from '../utils/validation';
import {
  Store,
  UserProfile,
  Category,
  Department,
  Unit,
  CatalogItem,
  InventoryItem,
  Transaction,
  TransactionType,
  TransactionReason,
  Requisition,
  AuditLog
} from '../types/models';

// ==========================================
// HELPERS
// ==========================================

const getTimestamp = (): Timestamp => Timestamp.now();

/**
 * Recursively removes all undefined fields from an object/array.
 * Firestore does not accept undefined field values.
 */
export function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefined(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const proto = Object.getPrototypeOf(obj);
    if (proto !== null && proto !== Object.prototype) {
      return obj;
    }
    const cleaned: any = {};
    for (const key of Object.keys(obj)) {
      const value = (obj as any)[key];
      if (value !== undefined) {
        cleaned[key] = cleanUndefined(value);
      }
    }
    return cleaned as T;
  }
  return obj;
}

// Write to Audit Log helper
export async function logActivity(activity: Omit<AuditLog, 'id' | 'timestamp' | 'ipAddress'>) {
  try {
    let clientIp = 'Unknown';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5s timeout
      const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        clientIp = data.ip || 'Unknown';
      }
    } catch (ipErr) {
      console.warn('Could not retrieve client IP address, defaulting to Unknown:', ipErr);
    }

    const logsRef = collection(db, 'auditLogs');
    await addDoc(logsRef, {
      ...activity,
      ipAddress: clientIp,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

// ==========================================
// USER SERVICES
// ==========================================

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const docRef = doc(db, 'users', uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as UserProfile;
  }
  return null;
}

export function subscribeToUserProfile(uid: string, callback: (profile: UserProfile | null) => void) {
  const docRef = doc(db, 'users', uid);
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data() as UserProfile);
    } else {
      callback(null);
    }
  });
}

export async function createUserProfile(uid: string, profile: Omit<UserProfile, 'uid' | 'createdAt'>): Promise<void> {
  const docRef = doc(db, 'users', uid);
  const newProfile: UserProfile = {
    ...profile,
    uid,
    createdAt: getTimestamp()
  };
  await setDoc(docRef, cleanUndefined(newProfile));
  
  await logActivity({
    userId: 'system',
    userName: 'System Administrator',
    userEmail: 'system@notoskitchen.com',
    action: 'CREATE_USER',
    storeId: profile.assignedStoreId,
    details: `Created user profile for ${profile.name} (${profile.email}) with role ${profile.role}`
  });
}

export async function updateUserProfile(uid: string, updates: Partial<UserProfile>, performedBy: { userId: string, userName: string, userEmail: string }): Promise<void> {
  const docRef = doc(db, 'users', uid);
  await updateDoc(docRef, cleanUndefined(updates));
  
  await logActivity({
    ...performedBy,
    action: 'UPDATE_USER',
    storeId: updates.assignedStoreId || null,
    details: `Updated user profile ${uid}. Fields: ${Object.keys(updates).join(', ')}`
  });
}

export async function deleteUserProfile(uid: string, performedBy: { userId: string, userName: string, userEmail: string }): Promise<void> {
  const docRef = doc(db, 'users', uid);
  await deleteDoc(docRef);
  
  await logActivity({
    ...performedBy,
    action: 'DELETE_USER',
    storeId: null,
    details: `Deleted user profile ${uid}`
  });
}

export function subscribeToUsers(callback: (users: UserProfile[]) => void) {
  const q = query(collection(db, 'users'), orderBy('name', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const users: UserProfile[] = [];
    snapshot.forEach((docSnap) => {
      users.push(docSnap.data() as UserProfile);
    });
    callback(users);
  });
}

// ==========================================
// STORE SERVICES
// ==========================================

export async function getStores(): Promise<Store[]> {
  const q = query(collection(db, 'stores'), orderBy('name', 'asc'));
  const snapshot = await getDocs(q);
  const stores: Store[] = [];
  snapshot.forEach((docSnap) => {
    stores.push(docSnap.data() as Store);
  });
  return stores;
}

export function subscribeToStores(callback: (stores: Store[]) => void) {
  const q = query(collection(db, 'stores'), orderBy('name', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const stores: Store[] = [];
    snapshot.forEach((docSnap) => {
      stores.push(docSnap.data() as Store);
    });
    callback(stores);
  });
}

export async function createStore(store: Omit<Store, 'id' | 'createdAt'>, performedBy: { userId: string, userName: string, userEmail: string }): Promise<string> {
  const cleanName = validateItemName(store.name);
  const cleanLocation = validateItemName(store.location);
  const cleanDesc = store.description ? validateNotes(store.description) : undefined;
  
  const storeRef = doc(collection(db, 'stores'));
  const newStore: Store = {
    name: cleanName,
    location: cleanLocation,
    description: cleanDesc,
    status: 'active',
    id: storeRef.id,
    createdAt: getTimestamp()
  };
  await setDoc(storeRef, cleanUndefined(newStore));
  
  await logActivity({
    ...performedBy,
    action: 'CREATE_STORE',
    storeId: storeRef.id,
    details: `Created new store: ${cleanName} in ${cleanLocation}`
  });
  
  return storeRef.id;
}

export async function updateStore(id: string, updates: Partial<Store>, performedBy: { userId: string, userName: string, userEmail: string }): Promise<void> {
  const docRef = doc(db, 'stores', id);
  await updateDoc(docRef, cleanUndefined(updates));
  
  await logActivity({
    ...performedBy,
    action: 'UPDATE_STORE',
    storeId: id,
    details: `Updated store ${id}. Fields: ${Object.keys(updates).join(', ')}`
  });
}

// ==========================================
// SETTINGS CONFIG SERVICES
// ==========================================

export function subscribeToCategories(storeId: string | null, callback: (categories: Category[]) => void) {
  const q = query(collection(db, 'categories'), orderBy('name', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const items: Category[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!storeId || !data.storeId || data.storeId === storeId) {
        items.push({ id: docSnap.id, ...data } as Category);
      }
    });
    callback(items);
  });
}

export async function createCategory(name: string, description?: string, storeId?: string | null): Promise<string> {
  const cleanName = validateItemName(name);
  const cleanDesc = description ? validateNotes(description) : undefined;
  const docRef = await addDoc(collection(db, 'categories'), { 
    name: cleanName, 
    description: cleanDesc || null,
    storeId: storeId || null
  });
  return docRef.id;
}

export async function updateCategory(
  id: string,
  name: string,
  description?: string,
  performedBy?: { userId: string; userName: string; userEmail: string }
): Promise<void> {
  const cleanName = validateItemName(name);
  const cleanDesc = description ? validateNotes(description) : undefined;
  const docRef = doc(db, 'categories', id);
  await updateDoc(docRef, { name: cleanName, description: cleanDesc || null });
  if (performedBy) {
    await logActivity({
      ...performedBy,
      action: 'UPDATE_CATEGORY',
      storeId: null,
      details: `Updated category: ${cleanName}`
    });
  }
}

export async function deleteCategory(
  id: string,
  performedBy?: { userId: string; userName: string; userEmail: string }
): Promise<void> {
  const docRef = doc(db, 'categories', id);
  await deleteDoc(docRef);
  if (performedBy) {
    await logActivity({
      ...performedBy,
      action: 'DELETE_CATEGORY',
      storeId: null,
      details: `Deleted category ID: ${id}`
    });
  }
}

export function subscribeToDepartments(storeId: string | null, callback: (departments: Department[]) => void) {
  const q = query(collection(db, 'departments'), orderBy('name', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const items: Department[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!storeId || !data.storeId || data.storeId === storeId) {
        items.push({ id: docSnap.id, ...data } as Department);
      }
    });
    callback(items);
  });
}

export async function createDepartment(name: string, description?: string, storeId?: string | null): Promise<string> {
  const cleanName = validateItemName(name);
  const cleanDesc = description ? validateNotes(description) : undefined;
  const docRef = await addDoc(collection(db, 'departments'), { 
    name: cleanName, 
    description: cleanDesc || null,
    storeId: storeId || null
  });
  return docRef.id;
}

export async function updateDepartment(
  id: string,
  name: string,
  description?: string,
  performedBy?: { userId: string; userName: string; userEmail: string }
): Promise<void> {
  const cleanName = validateItemName(name);
  const cleanDesc = description ? validateNotes(description) : undefined;
  const docRef = doc(db, 'departments', id);
  await updateDoc(docRef, { name: cleanName, description: cleanDesc || null });
  if (performedBy) {
    await logActivity({
      ...performedBy,
      action: 'UPDATE_DEPARTMENT',
      storeId: null,
      details: `Updated department: ${cleanName}`
    });
  }
}

export async function deleteDepartment(
  id: string,
  performedBy?: { userId: string; userName: string; userEmail: string }
): Promise<void> {
  const docRef = doc(db, 'departments', id);
  await deleteDoc(docRef);
  if (performedBy) {
    await logActivity({
      ...performedBy,
      action: 'DELETE_DEPARTMENT',
      storeId: null,
      details: `Deleted department ID: ${id}`
    });
  }
}

export function subscribeToUnits(storeId: string | null, callback: (units: Unit[]) => void) {
  const q = query(collection(db, 'units'), orderBy('name', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const items: Unit[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!storeId || !data.storeId || data.storeId === storeId) {
        items.push({ id: docSnap.id, ...data } as Unit);
      }
    });
    callback(items);
  });
}

export async function createUnit(name: string, abbreviation: string, storeId?: string | null): Promise<string> {
  const cleanName = validateItemName(name);
  const cleanAbbr = validateItemName(abbreviation);
  const docRef = await addDoc(collection(db, 'units'), { 
    name: cleanName, 
    abbreviation: cleanAbbr,
    storeId: storeId || null
  });
  return docRef.id;
}

export async function updateUnit(
  id: string,
  name: string,
  abbreviation: string,
  performedBy?: { userId: string; userName: string; userEmail: string }
): Promise<void> {
  const cleanName = validateItemName(name);
  const cleanAbbr = validateItemName(abbreviation);
  const docRef = doc(db, 'units', id);
  await updateDoc(docRef, { name: cleanName, abbreviation: cleanAbbr });
  if (performedBy) {
    await logActivity({
      ...performedBy,
      action: 'UPDATE_UNIT',
      storeId: null,
      details: `Updated unit: ${cleanName} (${cleanAbbr})`
    });
  }
}

export async function deleteUnit(
  id: string,
  performedBy?: { userId: string; userName: string; userEmail: string }
): Promise<void> {
  const docRef = doc(db, 'units', id);
  await deleteDoc(docRef);
  if (performedBy) {
    await logActivity({
      ...performedBy,
      action: 'DELETE_UNIT',
      storeId: null,
      details: `Deleted unit ID: ${id}`
    });
  }
}

// ==========================================
// CATALOG ITEMS SERVICES
// ==========================================

export function subscribeToCatalogItems(callback: (items: CatalogItem[]) => void) {
  const q = query(collection(db, 'items'), orderBy('name', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const items: CatalogItem[] = [];
    snapshot.forEach((docSnap) => {
      items.push(docSnap.data() as CatalogItem);
    });
    callback(items);
  });
}

export async function createCatalogItem(
  item: Omit<CatalogItem, 'id' | 'createdAt' | 'updatedAt'>,
  performedBy: { userId: string; userName: string; userEmail: string }
): Promise<string> {
  const cleanName = validateItemName(item.name);
  const q = query(collection(db, 'items'), where('name', '==', cleanName));
  const snap = await getDocs(q);
  if (!snap.empty) {
    throw new Error(`A catalog item with name "${item.name}" already exists.`);
  }

  const docRef = doc(collection(db, 'items'));
  const now = getTimestamp();
  const newItem: CatalogItem = {
    ...item,
    id: docRef.id,
    notes: item.notes ? validateNotes(item.notes) : undefined,
    createdAt: now,
    updatedAt: now
  };
  await setDoc(docRef, cleanUndefined(newItem));

  await logActivity({
    userId: performedBy.userId,
    userName: performedBy.userName,
    userEmail: performedBy.userEmail,
    action: 'CREATE_CATALOG_ITEM',
    storeId: null,
    details: `Created global catalog item: ${item.name}`
  });

  return docRef.id;
}

export async function registerItemAndAddToInventory(
  itemData: {
    storeId: string;
    name: string;
    categoryId: string;
    departmentId?: string | null;
    unitId: string;
    quantity: number;
    minStockLevel: number;
    costPrice: number;
    sellingPrice?: number;
    notes?: string;
  },
  performedBy: { userId: string; userName: string; userEmail: string }
): Promise<string> {
  const cleanName = validateItemName(itemData.name);
  
  if (itemData.quantity > 0) {
    validateQuantity(itemData.quantity);
  } else if (itemData.quantity < 0) {
    throw new Error('Quantity must be positive or zero.');
  }
  
  if (itemData.minStockLevel < 0) {
    throw new Error('Min stock level must be positive or zero.');
  }
  
  if (itemData.costPrice < 0) {
    throw new Error('Cost price must be positive or zero.');
  }
  
  const itemsRef = collection(db, 'items');
  const q = query(itemsRef, where('name', '==', cleanName));
  const snap = await getDocs(q);
  
  let catalogItemId: string;
  if (!snap.empty) {
    catalogItemId = snap.docs[0].id;
  } else {
    const newItemRef = doc(collection(db, 'items'));
    catalogItemId = newItemRef.id;
    const now = getTimestamp();
    const newCatalogItem: CatalogItem = {
      id: catalogItemId,
      name: cleanName,
      categoryId: itemData.categoryId,
      departmentId: itemData.departmentId || null,
      unitId: itemData.unitId,
      notes: itemData.notes ? validateNotes(itemData.notes) : undefined,
      createdAt: now,
      updatedAt: now
    };
    await setDoc(newItemRef, cleanUndefined(newCatalogItem));
  }
  
  const inventoryId = `${itemData.storeId}_${catalogItemId}`;
  const invRef = doc(db, 'inventory', inventoryId);
  const invSnap = await getDoc(invRef);
  if (invSnap.exists()) {
    throw new Error(`This item is already added to this store's inventory.`);
  }
  
  const now = getTimestamp();
  const newInventory: InventoryItem = {
    id: inventoryId,
    storeId: itemData.storeId,
    itemId: catalogItemId,
    itemName: itemData.name.trim(),
    categoryId: itemData.categoryId,
    departmentId: itemData.departmentId || null,
    unitId: itemData.unitId,
    openingStock: itemData.quantity,
    received: 0,
    issued: 0,
    damaged: 0,
    transferIn: 0,
    transferOut: 0,
    quantity: itemData.quantity,
    minStockLevel: itemData.minStockLevel,
    costPrice: itemData.costPrice,
    sellingPrice: itemData.sellingPrice,
    notes: itemData.notes ? validateNotes(itemData.notes) : undefined,
    createdAt: now,
    updatedAt: now,
    currentWeightedAverageCost: itemData.costPrice,
    lastPurchaseCost: itemData.quantity > 0 ? itemData.costPrice : 0,
    lastPurchaseDate: itemData.quantity > 0 ? now : null,
    inventoryValue: itemData.quantity * itemData.costPrice,
    minimumStock: itemData.minStockLevel
  };
  await setDoc(invRef, cleanUndefined(newInventory));
  
  if (itemData.quantity > 0) {
    const txRef = doc(collection(db, 'transactions'));
    const tx: Transaction = {
      id: txRef.id,
      storeId: itemData.storeId,
      itemId: catalogItemId,
      itemName: itemData.name.trim(),
      type: 'IN',
      quantity: itemData.quantity,
      reason: 'opening',
      performedBy: performedBy.userId,
      performedByName: performedBy.userName,
      createdAt: now
    };
    await setDoc(txRef, cleanUndefined(tx));
  }
  
  await logActivity({
    userId: performedBy.userId,
    userName: performedBy.userName,
    userEmail: performedBy.userEmail,
    action: 'CREATE_INVENTORY_ITEM',
    storeId: itemData.storeId,
    details: `Added ${itemData.name} to store inventory with quantity ${itemData.quantity}`
  });
  
  return inventoryId;
}

// ==========================================
// INVENTORY SERVICES
// ==========================================

export function subscribeToInventory(
  storeId: string | null,
  callback: (items: InventoryItem[]) => void,
  errorCallback?: (error: any) => void
) {
  const collRef = collection(db, 'inventory');
  let q = query(collRef, orderBy('itemName', 'asc'));
  if (storeId) {
    q = query(collRef, where('storeId', '==', storeId), orderBy('itemName', 'asc'));
  }
  return onSnapshot(q, (snapshot) => {
    const items: InventoryItem[] = [];
    snapshot.forEach((docSnap) => {
      items.push(docSnap.data() as InventoryItem);
    });
    callback(items);
  }, (error) => {
    if (errorCallback) errorCallback(error);
    else console.error('subscribeToInventory failed:', error);
  });
}

export async function createInventoryItem(
  item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'openingStock' | 'received' | 'issued' | 'damaged' | 'transferIn' | 'transferOut'>,
  performedBy: { userId: string; userName: string; userEmail: string }
): Promise<string> {
  const docId = `${item.storeId}_${item.itemId}`;
  const docRef = doc(db, 'inventory', docId);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    throw new Error(`This item is already added to this store's inventory.`);
  }

  const now = getTimestamp();
  const newItem: InventoryItem = {
    ...item,
    id: docId,
    openingStock: item.quantity,
    received: 0,
    issued: 0,
    damaged: 0,
    transferIn: 0,
    transferOut: 0,
    createdAt: now,
    updatedAt: now
  };
  await setDoc(docRef, cleanUndefined(newItem));

  if (item.quantity > 0) {
    const txRef = doc(collection(db, 'transactions'));
    const tx: Transaction = {
      id: txRef.id,
      storeId: item.storeId,
      itemId: item.itemId,
      itemName: item.itemName,
      type: 'IN',
      quantity: item.quantity,
      reason: 'opening',
      performedBy: performedBy.userId,
      performedByName: performedBy.userName,
      createdAt: now
    };
    await setDoc(txRef, cleanUndefined(tx));
  }

  await logActivity({
    userId: performedBy.userId,
    userName: performedBy.userName,
    userEmail: performedBy.userEmail,
    action: 'CREATE_INVENTORY_ITEM',
    storeId: item.storeId,
    details: `Added ${item.itemName} to store inventory with quantity ${item.quantity}`
  });

  return docId;
}

export async function updateInventoryItem(
  id: string,
  updates: Partial<Omit<InventoryItem, 'id' | 'quantity' | 'openingStock' | 'received' | 'issued' | 'damaged' | 'transferIn' | 'transferOut' | 'storeId' | 'itemId' | 'createdAt' | 'updatedAt'>>,
  performedBy: { userId: string; userName: string; userEmail: string }
): Promise<void> {
  const docRef = doc(db, 'inventory', id);
  const cleanUpdates = {
    ...updates,
    updatedAt: getTimestamp()
  };
  await updateDoc(docRef, cleanUndefined(cleanUpdates));
  
  await logActivity({
    userId: performedBy.userId,
    userName: performedBy.userName,
    userEmail: performedBy.userEmail,
    action: 'UPDATE_INVENTORY_ITEM',
    storeId: null,
    details: `Updated inventory item ${id}. Fields: ${Object.keys(updates).join(', ')}`
  });
}

/**
 * Perform an atomic stock adjustment using a Firestore Transaction with self-healing daily rollover.
 */
export async function adjustStock(
  inventoryItemId: string,
  quantity: number,
  type: TransactionType,
  reason: TransactionReason,
  performedBy: { userId: string; userName: string; userEmail: string },
  notes?: string | null,
  departmentId?: string | null,
  toStoreId?: string | null,
  fromStoreId?: string | null,
  unitCost?: number,
  supplierName?: string | null,
  invoiceNumber?: string | null
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const itemRef = doc(db, 'inventory', inventoryItemId);
    const itemSnap = await transaction.get(itemRef);

    if (!itemSnap.exists()) {
      throw new Error('Inventory item does not exist.');
    }

    const itemData = itemSnap.data() as InventoryItem;
    const currentQty = itemData.quantity || 0;
    
    // Check if the change causes negative quantity
    let newQty = currentQty;
    if (type === 'IN') {
      newQty = currentQty + quantity;
    } else if (type === 'OUT') {
      newQty = currentQty - quantity;
      if (newQty < 0) {
        throw new Error(`Insufficient stock for "${itemData.itemName}". Current stock is ${currentQty} but trying to remove/issue ${quantity}.`);
      }
    }

    // Daily rollover
    const lastUpdated = itemData.updatedAt.toDate();
    const today = new Date();
    const isDiffDay = lastUpdated.getFullYear() !== today.getFullYear() ||
                      lastUpdated.getMonth() !== today.getMonth() ||
                      lastUpdated.getDate() !== today.getDate();

    let opening = itemData.openingStock || 0;
    let received = itemData.received || 0;
    let issued = itemData.issued || 0;
    let damaged = itemData.damaged || 0;
    let transferIn = itemData.transferIn || 0;
    let transferOut = itemData.transferOut || 0;

    if (isDiffDay) {
      opening = currentQty;
      received = 0;
      issued = 0;
      damaged = 0;
      transferIn = 0;
      transferOut = 0;
    }

    // Update buckets
    if (type === 'IN') {
      if (reason === 'receive') {
        received += quantity;
      } else if (reason === 'transfer_in') {
        transferIn += quantity;
      } else if (reason === 'opening') {
        opening += quantity;
      } else {
        received += quantity;
      }
    } else if (type === 'OUT') {
      if (reason === 'issue') {
        issued += quantity;
      } else if (reason === 'damage') {
        damaged += quantity;
      } else if (reason === 'transfer_out') {
        transferOut += quantity;
      } else {
        damaged += quantity;
      }
    }

    // Calculate WAC for receiving stock, else preserve existing WAC
    let newWac = itemData.currentWeightedAverageCost ?? itemData.costPrice ?? 0;
    let lastCost = itemData.lastPurchaseCost ?? 0;
    let lastDate = itemData.lastPurchaseDate ?? null;

    if (type === 'IN' && reason === 'receive') {
      const currentCost = itemData.currentWeightedAverageCost ?? itemData.costPrice ?? 0;
      const cleanCurrentStock = Math.max(0, currentQty);
      const cleanUnitCost = unitCost !== undefined ? Math.max(0, unitCost) : currentCost;
      const totalQty = cleanCurrentStock + quantity;
      
      newWac = totalQty > 0
        ? Number((((cleanCurrentStock * currentCost) + (quantity * cleanUnitCost)) / totalQty).toFixed(2))
        : cleanUnitCost;
      
      lastCost = cleanUnitCost;
      lastDate = getTimestamp();
    }

    const finalInventoryValue = newQty * newWac;

    transaction.update(itemRef, {
      openingStock: opening,
      received,
      issued,
      damaged,
      transferIn,
      transferOut,
      quantity: newQty,
      updatedAt: getTimestamp(),
      currentWeightedAverageCost: newWac,
      costPrice: newWac,
      lastPurchaseCost: lastCost,
      lastPurchaseDate: lastDate,
      inventoryValue: finalInventoryValue,
      minimumStock: itemData.minimumStock ?? itemData.minStockLevel ?? 0
    });

    const txRef = doc(collection(db, 'transactions'));
    const tx: Transaction = {
      id: txRef.id,
      storeId: itemData.storeId,
      itemId: itemData.itemId,
      itemName: itemData.itemName,
      type,
      quantity,
      reason,
      performedBy: performedBy.userId,
      performedByName: performedBy.userName,
      createdAt: getTimestamp(),
      notes: notes || null,
      departmentId: departmentId || null,
      toStoreId: toStoreId || null,
      fromStoreId: fromStoreId || null,
      receivedCost: type === 'IN' && reason === 'receive' && unitCost !== undefined ? unitCost : undefined,
      oldAverageCost: type === 'IN' && reason === 'receive' ? (itemData.currentWeightedAverageCost ?? itemData.costPrice ?? 0) : undefined,
      newWeightedAverageCost: type === 'IN' && reason === 'receive' ? newWac : undefined,
      supplierName: type === 'IN' && reason === 'receive' ? supplierName : undefined,
      invoiceNumber: type === 'IN' && reason === 'receive' ? invoiceNumber : undefined
    };
    transaction.set(txRef, cleanUndefined(tx));
  });

  // Log activity
  await logActivity({
    userId: performedBy.userId,
    userName: performedBy.userName,
    userEmail: performedBy.userEmail,
    action: `ADJUST_STOCK_${type}`,
    storeId: inventoryItemId.split('_')[0],
    details: `Adjusted stock for ${inventoryItemId} with quantity ${quantity} (${type}, ${reason}). Notes: ${notes || 'None'}`
  });
}

/**
 * Transfer stock atomically between two stores in a transaction.
 */
export async function transferStock(
  supplyingInventoryItemId: string,
  receivingStoreId: string,
  quantity: number,
  performedBy: { userId: string; userName: string; userEmail: string },
  notes?: string | null
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const supplierItemRef = doc(db, 'inventory', supplyingInventoryItemId);
    const supplierSnap = await transaction.get(supplierItemRef);

    if (!supplierSnap.exists()) {
      throw new Error('Source inventory item does not exist.');
    }

    const supplierData = supplierSnap.data() as InventoryItem;
    const supplierQty = supplierData.quantity || 0;

    if (supplierQty < quantity) {
      throw new Error(`Insufficient stock for "${supplierData.itemName}" in supplying store. Available: ${supplierQty}, Requested: ${quantity}`);
    }

    const itemId = supplierData.itemId;
    const receiverItemId = `${receivingStoreId}_${itemId}`;
    const receiverItemRef = doc(db, 'inventory', receiverItemId);
    const receiverSnap = await transaction.get(receiverItemRef);

    const today = new Date();

    // 1. Update Supplying Store Item (OUT)
    const supplierLastUpdated = supplierData.updatedAt.toDate();
    const isSupplierDiffDay = supplierLastUpdated.getFullYear() !== today.getFullYear() ||
                              supplierLastUpdated.getMonth() !== today.getMonth() ||
                              supplierLastUpdated.getDate() !== today.getDate();

    let supplierOpening = supplierData.openingStock || 0;
    let supplierReceived = supplierData.received || 0;
    let supplierIssued = supplierData.issued || 0;
    let supplierDamaged = supplierData.damaged || 0;
    let supplierTransferIn = supplierData.transferIn || 0;
    let supplierTransferOut = supplierData.transferOut || 0;

    if (isSupplierDiffDay) {
      supplierOpening = supplierQty;
      supplierReceived = 0;
      supplierIssued = 0;
      supplierDamaged = 0;
      supplierTransferIn = 0;
      supplierTransferOut = 0;
    }

    const supplierWac = supplierData.currentWeightedAverageCost ?? supplierData.costPrice ?? 0;
    transaction.update(supplierItemRef, {
      openingStock: supplierOpening,
      received: supplierReceived,
      issued: supplierIssued,
      damaged: supplierDamaged,
      transferIn: supplierTransferIn,
      transferOut: supplierTransferOut + quantity,
      quantity: supplierQty - quantity,
      inventoryValue: (supplierQty - quantity) * supplierWac,
      updatedAt: getTimestamp()
    });

    // 2. Update/Create Receiving Store Item (IN)
    if (receiverSnap.exists()) {
      const receiverData = receiverSnap.data() as InventoryItem;
      const receiverQty = receiverData.quantity || 0;

      const receiverLastUpdated = receiverData.updatedAt.toDate();
      const isReceiverDiffDay = receiverLastUpdated.getFullYear() !== today.getFullYear() ||
                                receiverLastUpdated.getMonth() !== today.getMonth() ||
                                receiverLastUpdated.getDate() !== today.getDate();

      let receiverOpening = receiverData.openingStock || 0;
      let receiverReceived = receiverData.received || 0;
      let receiverIssued = receiverData.issued || 0;
      let receiverDamaged = receiverData.damaged || 0;
      let receiverTransferIn = receiverData.transferIn || 0;
      let receiverTransferOut = receiverData.transferOut || 0;

      if (isReceiverDiffDay) {
        receiverOpening = receiverQty;
        receiverReceived = 0;
        receiverIssued = 0;
        receiverDamaged = 0;
        receiverTransferIn = 0;
        receiverTransferOut = 0;
      }

      const receiverCost = receiverData.currentWeightedAverageCost ?? receiverData.costPrice ?? 0;
      const newReceiverQty = receiverQty + quantity;

      transaction.update(receiverItemRef, {
        openingStock: receiverOpening,
        received: receiverReceived,
        issued: receiverIssued,
        damaged: receiverDamaged,
        transferIn: receiverTransferIn + quantity,
        transferOut: receiverTransferOut,
        quantity: newReceiverQty,
        inventoryValue: newReceiverQty * receiverCost,
        updatedAt: getTimestamp()
      });
    } else {
      const newInventory: InventoryItem = {
        id: receiverItemId,
        storeId: receivingStoreId,
        itemId: itemId,
        itemName: supplierData.itemName,
        categoryId: supplierData.categoryId,
        departmentId: supplierData.departmentId,
        unitId: supplierData.unitId,
        openingStock: 0,
        received: 0,
        issued: 0,
        damaged: 0,
        transferIn: quantity,
        transferOut: 0,
        quantity: quantity,
        minStockLevel: supplierData.minStockLevel || 5,
        costPrice: supplierData.costPrice,
        currentWeightedAverageCost: supplierData.currentWeightedAverageCost ?? supplierData.costPrice ?? 0,
        lastPurchaseCost: supplierData.lastPurchaseCost ?? 0,
        lastPurchaseDate: supplierData.lastPurchaseDate ?? null,
        inventoryValue: quantity * (supplierData.currentWeightedAverageCost ?? supplierData.costPrice ?? 0),
        minimumStock: supplierData.minimumStock ?? supplierData.minStockLevel ?? 5,
        sellingPrice: supplierData.sellingPrice || undefined,
        createdAt: getTimestamp(),
        updatedAt: getTimestamp()
      };
      transaction.set(receiverItemRef, cleanUndefined(newInventory));
    }

    // 3. Create Transactions logs
    const supplierTxRef = doc(collection(db, 'transactions'));
    const supplierTx: Transaction = {
      id: supplierTxRef.id,
      storeId: supplierData.storeId,
      itemId: itemId,
      itemName: supplierData.itemName,
      type: 'OUT',
      quantity,
      reason: 'transfer_out',
      toStoreId: receivingStoreId,
      performedBy: performedBy.userId,
      performedByName: performedBy.userName,
      createdAt: getTimestamp(),
      notes: notes || null
    };
    transaction.set(supplierTxRef, cleanUndefined(supplierTx));

    const receiverTxRef = doc(collection(db, 'transactions'));
    const receiverTx: Transaction = {
      id: receiverTxRef.id,
      storeId: receivingStoreId,
      itemId: itemId,
      itemName: supplierData.itemName,
      type: 'IN',
      quantity,
      reason: 'transfer_in',
      fromStoreId: supplierData.storeId,
      performedBy: performedBy.userId,
      performedByName: performedBy.userName,
      createdAt: getTimestamp(),
      notes: notes || null
    };
    transaction.set(receiverTxRef, cleanUndefined(receiverTx));
  });

  // Log activity
  await logActivity({
    userId: performedBy.userId,
    userName: performedBy.userName,
    userEmail: performedBy.userEmail,
    action: 'TRANSFER_STOCK',
    storeId: supplyingInventoryItemId.split('_')[0],
    details: `Transferred ${quantity} units of item ${supplyingInventoryItemId} to store ${receivingStoreId}. Notes: ${notes || 'None'}`
  });
}



// ==========================================
// TRANSACTION SERVICES
// ==========================================

export function subscribeToTransactions(
  storeId: string | null,
  limitCount: number = 50,
  callback: (transactions: Transaction[]) => void,
  errorCallback?: (error: any) => void
) {
  const collRef = collection(db, 'transactions');
  let q = query(collRef, orderBy('createdAt', 'desc'), limit(limitCount));
  
  if (storeId) {
    q = query(collRef, where('storeId', '==', storeId), orderBy('createdAt', 'desc'), limit(limitCount));
  }
  
  return onSnapshot(q, (snapshot) => {
    const transactions: Transaction[] = [];
    snapshot.forEach((docSnap) => {
      transactions.push(docSnap.data() as Transaction);
    });
    callback(transactions);
  }, (error) => {
    if (errorCallback) errorCallback(error);
    else console.error('subscribeToTransactions failed:', error);
  });
}

// Keep helper reference compatible with previous code
export const subscribeToStockMovements = subscribeToTransactions;

// ==========================================
// REQUISITION SERVICES
// ==========================================

export function subscribeToRequisitions(
  storeId: string | null,
  callback: (requisitions: Requisition[]) => void,
  errorCallback?: (error: any) => void
) {
  const collRef = collection(db, 'requisitions');
  let q = query(collRef, orderBy('createdAt', 'desc'));
  
  if (storeId) {
    q = query(
      collRef,
      or(
        where('fromStoreId', '==', storeId),
        where('toStoreId', '==', storeId)
      ),
      orderBy('createdAt', 'desc')
    );
  }
  
  return onSnapshot(q, (snapshot) => {
    const requisitions: Requisition[] = [];
    snapshot.forEach((docSnap) => {
      requisitions.push(docSnap.data() as Requisition);
    });
    callback(requisitions);
  }, (error) => {
    if (errorCallback) errorCallback(error);
    else console.error('subscribeToRequisitions failed:', error);
  });
}

export async function createRequisition(
  fromStoreId: string,
  toStoreId: string,
  items: { itemId: string; name: string; requestedQty: number }[],
  requestedBy: { userId: string, userName: string, userEmail: string }
): Promise<string> {
  if (items.length === 0) {
    throw new Error('Cannot create an empty requisition.');
  }

  // Validate items requested
  items.forEach(i => {
    validateItemName(i.name);
    validateQuantity(i.requestedQty);
  });  const reqRef = doc(collection(db, 'requisitions'));
  const newRequisition: Requisition = {
    id: reqRef.id,
    fromStoreId,
    toStoreId,
    status: 'pending',
    items: items.map(i => ({ 
      itemId: i.itemId, 
      name: validateItemName(i.name), 
      requestedQty: validateQuantity(i.requestedQty), 
      fulfilledQty: 0 
    })),
    requestedBy: requestedBy.userId,
    requestedByName: requestedBy.userName,
    createdAt: getTimestamp(),
    updatedAt: getTimestamp()
  };
  
  await setDoc(reqRef, cleanUndefined(newRequisition));
  
  await logActivity({
    userId: requestedBy.userId,
    userName: requestedBy.userName,
    userEmail: requestedBy.userEmail,
    action: 'CREATE_REQUISITION',
    storeId: fromStoreId,
    details: `Created requisition ${reqRef.id} requesting ${items.length} items from Store ${toStoreId}`
  });
  
  return reqRef.id;
}

export async function approveRequisition(
  requisitionId: string,
  approvedBy: { userId: string, userName: string, userEmail: string }
): Promise<void> {
  const reqRef = doc(db, 'requisitions', requisitionId);
  await updateDoc(reqRef, {
    status: 'approved',
    approvedBy: approvedBy.userId,
    approvedByName: approvedBy.userName,
    updatedAt: getTimestamp()
  });
  
  await logActivity({
    userId: approvedBy.userId,
    userName: approvedBy.userName,
    userEmail: approvedBy.userEmail,
    action: 'APPROVE_REQUISITION',
    storeId: null,
    details: `Approved requisition ${requisitionId}`
  });
}

export async function rejectRequisition(
  requisitionId: string,
  rejectionReason: string,
  approvedBy: { userId: string, userName: string, userEmail: string }
): Promise<void> {
  const cleanReason = validateNotes(rejectionReason);
  const reqRef = doc(db, 'requisitions', requisitionId);
  await updateDoc(reqRef, {
    status: 'rejected',
    rejectionReason: cleanReason,
    approvedBy: approvedBy.userId,
    approvedByName: approvedBy.userName,
    updatedAt: getTimestamp()
  });
  
  await logActivity({
    userId: approvedBy.userId,
    userName: approvedBy.userName,
    userEmail: approvedBy.userEmail,
    action: 'REJECT_REQUISITION',
    storeId: null,
    details: `Rejected requisition ${requisitionId}. Reason: ${rejectionReason}`
  });
}

export async function cancelRequisition(
  requisitionId: string,
  performedBy: { userId: string, userName: string, userEmail: string }
): Promise<void> {
  const reqRef = doc(db, 'requisitions', requisitionId);
  await updateDoc(reqRef, {
    status: 'cancelled',
    updatedAt: getTimestamp()
  });
  
  await logActivity({
    userId: performedBy.userId,
    userName: performedBy.userName,
    userEmail: performedBy.userEmail,
    action: 'CANCEL_REQUISITION',
    storeId: null,
    details: `Cancelled requisition ${requisitionId}`
  });
}

/**
 * Fulfill a Requisition in a strict Firestore Transaction.
 */
export async function fulfillRequisition(
  requisitionId: string,
  fulfilledBy: { userId: string, userName: string, userEmail: string },
  itemsIssued?: { itemId: string, fulfilledQty: number }[]
): Promise<void> {
  await runTransaction(db, async (firestoreTransaction) => {
    const reqRef = doc(db, 'requisitions', requisitionId);
    const reqSnap = await firestoreTransaction.get(reqRef);
    
    if (!reqSnap.exists()) {
      throw new Error('Requisition does not exist.');
    }
    
    const requisition = reqSnap.data() as Requisition;
    
    if (requisition.status !== 'approved' && requisition.status !== 'pending') {
      throw new Error(`Only pending or approved requisitions can be fulfilled. Current status: ${requisition.status}`);
    }
    
    const supplyingStoreId = requisition.toStoreId;
    const requestingStoreId = requisition.fromStoreId;

    // Fetch supplying and requesting store names to record descriptive notes
    const supplierStoreRef = doc(db, 'stores', supplyingStoreId);
    const receiverStoreRef = doc(db, 'stores', requestingStoreId);
    const [supplierStoreSnap, receiverStoreSnap] = await Promise.all([
      firestoreTransaction.get(supplierStoreRef),
      firestoreTransaction.get(receiverStoreRef)
    ]);
    const supplierStoreName = supplierStoreSnap.exists() ? (supplierStoreSnap.data() as Store).name : 'Store';
    const receiverStoreName = receiverStoreSnap.exists() ? (receiverStoreSnap.data() as Store).name : 'Store';
    
    // Prepare all item details and references for bulk pre-fetching
    const itemRefs = requisition.items.map(item => {
      const catalogItemId = item.itemId.includes('_')
        ? item.itemId.substring(item.itemId.indexOf('_') + 1)
        : item.itemId;

      const supplierItemId = `${supplyingStoreId}_${catalogItemId}`;
      const receiverItemId = `${requestingStoreId}_${catalogItemId}`;
      
      return {
        item,
        catalogItemId,
        supplierItemId,
        receiverItemId,
        supplierItemRef: doc(db, 'inventory', supplierItemId),
        receiverItemRef: doc(db, 'inventory', receiverItemId)
      };
    });

    // Perform all document reads BEFORE executing any write operations in the transaction
    const supplierSnaps = await Promise.all(itemRefs.map(r => firestoreTransaction.get(r.supplierItemRef)));
    const receiverSnaps = await Promise.all(itemRefs.map(r => firestoreTransaction.get(r.receiverItemRef)));

    const today = new Date();
    
    for (let i = 0; i < itemRefs.length; i++) {
      const { item, catalogItemId, supplierItemId, receiverItemId, supplierItemRef, receiverItemRef } = itemRefs[i];
      const supplierSnap = supplierSnaps[i];
      const receiverSnap = receiverSnaps[i];
      
      if (!supplierSnap.exists()) {
        throw new Error(`Item ${item.name} does not exist in the supplying store.`);
      }
      
      const supplierData = supplierSnap.data() as InventoryItem;
      const supplierQty = supplierData.quantity || 0;
      
      // Determine the quantity actually issued
      const customMatch = itemsIssued?.find(x => x.itemId === item.itemId);
      const qtyIssued = customMatch !== undefined ? customMatch.fulfilledQty : item.requestedQty;

      if (qtyIssued < 0) {
        throw new Error(`Quantity issued for "${item.name}" cannot be negative.`);
      }
      
      if (supplierQty < qtyIssued) {
        throw new Error(`Insufficient stock for "${item.name}" in supplying store. Available: ${supplierQty}, Trying to issue: ${qtyIssued}`);
      }
      
      const supplierLastUpdated = supplierData.updatedAt.toDate();
      const isSupplierDiffDay = supplierLastUpdated.getFullYear() !== today.getFullYear() ||
                                supplierLastUpdated.getMonth() !== today.getMonth() ||
                                supplierLastUpdated.getDate() !== today.getDate();
                                
      let supplierOpening = supplierData.openingStock || 0;
      let supplierReceived = supplierData.received || 0;
      let supplierIssued = supplierData.issued || 0;
      let supplierDamaged = supplierData.damaged || 0;
      let supplierTransferIn = supplierData.transferIn || 0;
      let supplierTransferOut = supplierData.transferOut || 0;
      
      if (isSupplierDiffDay) {
        supplierOpening = supplierQty;
        supplierReceived = 0;
        supplierIssued = 0;
        supplierDamaged = 0;
        supplierTransferIn = 0;
        supplierTransferOut = 0;
      }
      
      const supplierWac = supplierData.currentWeightedAverageCost ?? supplierData.costPrice ?? 0;
      firestoreTransaction.update(supplierItemRef, {
        openingStock: supplierOpening,
        received: supplierReceived,
        issued: supplierIssued,
        damaged: supplierDamaged,
        transferIn: supplierTransferIn,
        transferOut: supplierTransferOut + qtyIssued,
        quantity: supplierQty - qtyIssued,
        inventoryValue: (supplierQty - qtyIssued) * supplierWac,
        updatedAt: getTimestamp()
      });
      
      const supplierTxRef = doc(collection(db, 'transactions'));
      const supplierTx: Transaction = {
        id: supplierTxRef.id,
        storeId: supplyingStoreId,
        itemId: catalogItemId,
        itemName: item.name,
        type: 'OUT',
        quantity: qtyIssued,
        reason: 'transfer_out',
        referenceId: requisitionId,
        toStoreId: requestingStoreId,
        notes: `Issued to ${receiverStoreName}`,
        performedBy: fulfilledBy.userId,
        performedByName: fulfilledBy.userName,
        createdAt: getTimestamp()
      };
      firestoreTransaction.set(supplierTxRef, cleanUndefined(supplierTx));
      
      if (receiverSnap.exists()) {
        const receiverData = receiverSnap.data() as InventoryItem;
        const receiverQty = receiverData.quantity || 0;
        
        const receiverLastUpdated = receiverData.updatedAt.toDate();
        const isReceiverDiffDay = receiverLastUpdated.getFullYear() !== today.getFullYear() ||
                                  receiverLastUpdated.getMonth() !== today.getMonth() ||
                                  receiverLastUpdated.getDate() !== today.getDate();
                                  
        let receiverOpening = receiverData.openingStock || 0;
        let receiverReceived = receiverData.received || 0;
        let receiverIssued = receiverData.issued || 0;
        let receiverDamaged = receiverData.damaged || 0;
        let receiverTransferIn = receiverData.transferIn || 0;
        let receiverTransferOut = receiverData.transferOut || 0;
        
        if (isReceiverDiffDay) {
          receiverOpening = receiverQty;
          receiverReceived = 0;
          receiverIssued = 0;
          receiverDamaged = 0;
          receiverTransferIn = 0;
          receiverTransferOut = 0;
        }
        
        const receiverCost = receiverData.currentWeightedAverageCost ?? receiverData.costPrice ?? 0;
        const newReceiverQty = receiverQty + qtyIssued;
 
        firestoreTransaction.update(receiverItemRef, {
          openingStock: receiverOpening,
          received: receiverReceived,
          issued: receiverIssued,
          damaged: receiverDamaged,
          transferIn: receiverTransferIn + qtyIssued,
          transferOut: receiverTransferOut,
          quantity: newReceiverQty,
          inventoryValue: newReceiverQty * receiverCost,
          updatedAt: getTimestamp()
        });
      } else {
        const newInventory: InventoryItem = {
          id: receiverItemId,
          storeId: requestingStoreId,
          itemId: catalogItemId,
          itemName: supplierData.itemName,
          categoryId: supplierData.categoryId,
          departmentId: supplierData.departmentId,
          unitId: supplierData.unitId,
          openingStock: 0,
          received: 0,
          issued: 0,
          damaged: 0,
          transferIn: qtyIssued,
          transferOut: 0,
          quantity: qtyIssued,
          minStockLevel: supplierData.minStockLevel || 5,
          costPrice: supplierData.costPrice,
          currentWeightedAverageCost: supplierData.currentWeightedAverageCost ?? supplierData.costPrice ?? 0,
          lastPurchaseCost: supplierData.lastPurchaseCost ?? 0,
          lastPurchaseDate: supplierData.lastPurchaseDate ?? null,
          inventoryValue: qtyIssued * (supplierData.currentWeightedAverageCost ?? supplierData.costPrice ?? 0),
          minimumStock: supplierData.minimumStock ?? supplierData.minStockLevel ?? 5,
          sellingPrice: supplierData.sellingPrice || undefined,
          createdAt: getTimestamp(),
          updatedAt: getTimestamp()
        };
        firestoreTransaction.set(receiverItemRef, cleanUndefined(newInventory));
      }
      
      const receiverTxRef = doc(collection(db, 'transactions'));
      const receiverTx: Transaction = {
        id: receiverTxRef.id,
        storeId: requestingStoreId,
        itemId: catalogItemId,
        itemName: item.name,
        type: 'IN',
        quantity: qtyIssued,
        reason: 'transfer_in',
        referenceId: requisitionId,
        fromStoreId: supplyingStoreId,
        notes: `Received from ${supplierStoreName}`,
        performedBy: fulfilledBy.userId,
        performedByName: fulfilledBy.userName,
        createdAt: getTimestamp()
      };
      firestoreTransaction.set(receiverTxRef, cleanUndefined(receiverTx));
      
      item.fulfilledQty = qtyIssued;
    }
    
    firestoreTransaction.update(reqRef, {
      status: 'fulfilled',
      items: requisition.items,
      updatedAt: getTimestamp()
    });
  });

  await logActivity({
    userId: fulfilledBy.userId,
    userName: fulfilledBy.userName,
    userEmail: fulfilledBy.userEmail,
    action: 'FULFILL_REQUISITION',
    storeId: null,
    details: `Fulfilled requisition ${requisitionId}`
  });
}

// ==========================================
// AUDIT LOG SERVICES
// ==========================================

export function subscribeToAuditLogs(limitCount: number = 100, callback: (logs: AuditLog[]) => void) {
  const q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(limitCount));
  return onSnapshot(q, (snapshot) => {
    const logs: AuditLog[] = [];
    snapshot.forEach((docSnap) => {
      logs.push({ id: docSnap.id, ...docSnap.data() } as AuditLog);
    });
    callback(logs);
  });
}
