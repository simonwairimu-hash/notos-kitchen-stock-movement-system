import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { useToast } from '../../context/ToastContext';
import { 
  subscribeToInventory, 
  subscribeToCategories, 
  subscribeToDepartments, 
  subscribeToUnits,
  registerItemAndAddToInventory,
  adjustStock
} from '../../services/dbService';
import { InventoryItem, Category, Department, Unit, TransactionType, TransactionReason } from '../../types/models';
import { 
  Plus, 
  Search, 
  AlertTriangle, 
  Package, 
  X, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Store
} from 'lucide-react';
import { validateItemName, validateQuantity, validateNotes } from '../../utils/validation';
import { formatCurrency } from '../../utils/formatters';

export const Inventory: React.FC = () => {
  const { profile, isAdmin, isStoreUser } = useAuth();
  const { selectedStoreId, setSelectedStoreId, stores } = useStore();
  const { showToast } = useToast();

  // Core data states
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  
  // UI/filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal control states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  // Forms states
  const [submitting, setSubmitting] = useState(false);
  
  // Toggle for opening stock in add item modal
  const [addOpeningStock, setAddOpeningStock] = useState(true);

  // Add item form state
  const [newItem, setNewItem] = useState({
    name: '',
    categoryId: '',
    storeId: '',
    unitId: '',
    quantity: 0,
    minStockLevel: 0,
    costPrice: 0,
    notes: ''
  });

  // Adjust stock form state
  const [adjustment, setAdjustment] = useState({
    qty: '',
    type: 'IN' as TransactionType,
    reason: 'receive' as TransactionReason
  });

  // Subscriptions
  useEffect(() => {
    if (!isAdmin() && !selectedStoreId) {
      return;
    }
    // Avoid synchronous render loop warnings
    setLoading(prev => prev ? prev : true);

    const unsubInv = subscribeToInventory(selectedStoreId, (items) => {
      setInventory(items);
      setLoading(false);
    }, (error) => {
      console.error('Inventory subscription failed:', error);
      setLoading(false);
    });

    const unsubCat = subscribeToCategories(selectedStoreId, setCategories);
    const unsubDept = subscribeToDepartments(selectedStoreId, setDepartments);
    const unsubUnit = subscribeToUnits(selectedStoreId, setUnits);

    return () => {
      unsubInv();
      unsubCat();
      unsubDept();
      unsubUnit();
    };
  }, [selectedStoreId, isAdmin]);

  // Derived filtered items
  const filteredInventory = inventory.filter(item => {
    const matchesSearch = 
      item.itemName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || item.categoryId === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const resetAddItemForm = () => {
    setNewItem({
      name: '',
      categoryId: categories[0]?.id || '',
      storeId: selectedStoreId || (stores[0]?.id || ''),
      unitId: units[0]?.id || '',
      quantity: 0,
      minStockLevel: 0,
      costPrice: 0,
      notes: ''
    });
    setAddOpeningStock(true);
  };

  const handleOpenAddModal = () => {
    resetAddItemForm();
    setIsAddModalOpen(true);
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();

    const targetStoreId = isAdmin() ? newItem.storeId : selectedStoreId;
    if (!targetStoreId) {
      showToast('Please select a target store.', 'error');
      return;
    }

    if (!newItem.name.trim() || !newItem.categoryId || !newItem.unitId) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const cleanName = validateItemName(newItem.name);
      
      const openingStockQty = addOpeningStock ? Number(newItem.quantity) : 0;
      if (openingStockQty > 0) {
        validateQuantity(openingStockQty);
      } else if (openingStockQty < 0) {
        throw new Error('Opening stock quantity must be positive or zero.');
      }
      
      if (newItem.minStockLevel < 0) {
        throw new Error('Min stock level must be positive or zero.');
      }
      if (newItem.costPrice < 0) {
        throw new Error('Cost price must be positive or zero.');
      }

      // Automatically map to a default or matching department since department is not in UI form
      // Lookup if a department matches or fall back to the first available department
      const matchingDept = departments.find(d => d.name.toLowerCase() === 'others' || d.name.toLowerCase().includes(cleanName.toLowerCase())) || departments[0];
      const targetDeptId = matchingDept?.id || 'default_dept';

      await registerItemAndAddToInventory({
        storeId: targetStoreId,
        name: cleanName,
        categoryId: newItem.categoryId,
        departmentId: targetDeptId,
        unitId: newItem.unitId,
        quantity: openingStockQty,
        minStockLevel: Number(newItem.minStockLevel),
        costPrice: Number(newItem.costPrice),
        notes: newItem.notes.trim() ? validateNotes(newItem.notes) : undefined
      }, {
        userId: profile!.uid,
        userName: profile!.name,
        userEmail: profile!.email
      });

      showToast(`Successfully added item: ${newItem.name}`);
      setIsAddModalOpen(false);
      resetAddItemForm();
    } catch (err: any) {
      showToast(err.message || 'Failed to add item.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenAdjustModal = (item: InventoryItem) => {
    setSelectedItem(item);
    setAdjustment({
      qty: '',
      type: 'IN',
      reason: 'receive'
    });
    setIsAdjustModalOpen(true);
  };

  const handleAdjustStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !selectedStoreId) return;
    
    const qtyNum = Number(adjustment.qty);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      showToast('Please enter a valid quantity greater than zero.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      validateQuantity(qtyNum);
      await adjustStock(
        selectedItem.id,
        qtyNum,
        adjustment.type,
        adjustment.reason,
        {
          userId: profile!.uid,
          userName: profile!.name,
          userEmail: profile!.email
        }
      );
      showToast(`Successfully adjusted stock for: ${selectedItem.itemName}`);
      setIsAdjustModalOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to adjust stock.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Helper selectors
  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name || 'General';
  const getDepartmentName = (id: string) => departments.find(d => d.id === id)?.name || 'General';
  const getUnitAbbreviation = (id: string) => units.find(u => u.id === id)?.abbreviation || 'pcs';
  const getStoreName = (id: string) => stores.find(s => s.id === id)?.name || 'Unknown Store';

  return (
    <div className="space-y-6">
      
      {/* Header Info */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-gray-900 md:text-2xl">
            Inventory
          </h2>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">
            {filteredInventory.length} {filteredInventory.length === 1 ? 'item' : 'items'}
          </p>
        </div>

        {/* Add Item Trigger */}
        {(isAdmin() || isStoreUser()) && (
          <button
            onClick={handleOpenAddModal}
            className="flex items-center justify-center py-2 px-4 rounded-xl text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 transition-colors shadow-sm shrink-0"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add Item
          </button>
        )}
      </div>

      {/* ==========================================
          SEARCH AND FILTERS BAR
          ========================================== */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        
        {/* Left Side: Search Box & Category Filter */}
        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative">
            <input
              type="text"
              className="block w-12 hover:w-48 focus:w-48 rounded-xl border border-gray-200 bg-white px-3 py-2 pl-9 text-xs font-semibold text-gray-700 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 transition-all duration-300"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
              <Search className="h-3.5 w-3.5" />
            </div>
          </div>

          {/* Category Filter */}
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white pl-3 pr-8 py-2 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none appearance-none"
              style={{ 
                backgroundImage: 'url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 20 20\' fill=\'none\'%3E%3Cpath d=\'M7 9l3 3 3-3\' stroke=\'%236b7280\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E")', 
                backgroundPosition: 'right 0.5rem center', 
                backgroundSize: '1rem', 
                backgroundRepeat: 'no-repeat' 
              }}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Right Side: Store Filter Dropdown (Admin only) */}
        {isAdmin() && (
          <div className="flex-1 max-w-xs w-full">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Store</label>
            <div className="relative">
              <select
                value={selectedStoreId || ''}
                onChange={(e) => setSelectedStoreId(e.target.value || null)}
                className="block w-full rounded-xl border border-gray-200 bg-white pl-9 pr-8 py-2 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none appearance-none"
                style={{ 
                  backgroundImage: 'url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 20 20\' fill=\'none\'%3E%3Cpath d=\'M7 9l3 3 3-3\' stroke=\'%236b7280\' stroke-width=\'1.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E")', 
                  backgroundPosition: 'right 0.5rem center', 
                  backgroundSize: '1rem', 
                  backgroundRepeat: 'no-repeat' 
                }}
              >
                <option value="">All Stores</option>
                {stores.map((st) => (
                  <option key={st.id} value={st.id}>{st.name}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
                <Store className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==========================================
          INVENTORY LIST (CARD GRID SYSTEM)
          ========================================== */}
      {loading ? (
        <div className="flex h-[30vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-orange-500 border-t-transparent"></div>
        </div>
      ) : filteredInventory.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm text-center">
          <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-gray-600">No items found</p>
          <p className="text-xs text-gray-400 mt-1">Try expanding your search query or filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredInventory.map((item) => {
            const isLow = item.quantity <= item.minStockLevel;
            const categoryName = getCategoryName(item.categoryId);
            const storeName = getStoreName(item.storeId);
            const unitAbr = getUnitAbbreviation(item.unitId);
            const valuation = item.quantity * item.costPrice;

            return (
              <div 
                key={item.id} 
                onClick={() => handleOpenAdjustModal(item)}
                className={`bg-white rounded-2xl border p-5 flex flex-col justify-between hover:shadow-md transition-shadow relative cursor-pointer min-h-[160px] ${
                  isLow ? 'border-red-100 bg-red-50/10' : 'border-gray-150 shadow-sm'
                }`}
              >
                {/* Upper content */}
                <div>
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 pr-3">
                      <h4 className="text-sm font-extrabold text-gray-950 truncate flex items-center">
                        {item.itemName}
                        {isLow && (
                          <AlertTriangle className="h-4 w-4 text-red-500 ml-1.5 shrink-0" />
                        )}
                      </h4>
                      <p className="text-[10px] text-gray-400 font-semibold uppercase mt-0.5">
                        {categoryName}
                      </p>
                      <p className="text-[10px] text-gray-400 font-semibold uppercase mt-0.5">
                        {storeName}
                      </p>
                    </div>
                    
                    {/* Quantity Display */}
                    <div className="text-right shrink-0">
                      <span className={`text-2xl font-black ${isLow ? 'text-red-500' : 'text-gray-800'}`}>
                        {item.quantity}
                      </span>
                      <p className="text-[10px] font-bold text-gray-400 uppercase mt-0.5">{unitAbr}</p>
                    </div>
                  </div>
                </div>

                {/* Footer section separated by horizontal line */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[10px]">
                  {/* Valuation Label */}
                  <span className="text-gray-400 font-bold uppercase tracking-wider">
                    Estimated Cost
                  </span>
                  
                  {/* Valuation */}
                  <span className="font-extrabold text-gray-800 uppercase tracking-wider">
                    {formatCurrency(valuation)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==========================================
          ADD ITEM MODAL (MATCHING SCREENSHOT)
          ========================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center p-0 md:p-4">
          <div className="w-full max-w-lg bg-white rounded-t-2xl md:rounded-2xl flex flex-col max-h-[90vh] md:max-h-[85vh] shadow-2xl animate-slide-up">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h3 className="text-sm font-extrabold text-gray-950">Add New Item</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form Scroll Area */}
            <form onSubmit={handleCreateItem} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs font-semibold text-gray-700">
              {/* Item Name */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                  placeholder="e.g., Cooking Oil"
                  value={newItem.name}
                  onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                />
              </div>



              {/* Category and Unit */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Category *</label>
                  <select
                    required
                    value={newItem.categoryId}
                    onChange={(e) => setNewItem({...newItem, categoryId: e.target.value})}
                    className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                  >
                    <option value="" disabled>Select</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Unit *</label>
                  <select
                    required
                    value={newItem.unitId}
                    onChange={(e) => setNewItem({...newItem, unitId: e.target.value})}
                    className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                  >
                    <option value="" disabled>Select</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Store Outlet selection */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Store *</label>
                {isAdmin() ? (
                  <select
                    required
                    value={newItem.storeId}
                    onChange={(e) => setNewItem({...newItem, storeId: e.target.value})}
                    className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                  >
                    <option value="" disabled>Select store</option>
                    {stores.map((st) => (
                      <option key={st.id} value={st.id}>{st.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    disabled
                    className="block w-full rounded-xl border border-gray-200 bg-gray-100 px-3 py-2 text-xs font-bold text-gray-500 cursor-not-allowed"
                    value={getStoreName(selectedStoreId || '')}
                  />
                )}
              </div>

              {/* Cost Price and Min Stock */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Cost per Unit *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="any"
                    className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                    placeholder="0.00"
                    value={newItem.costPrice || ''}
                    onChange={(e) => setNewItem({...newItem, costPrice: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Min Stock Level</label>
                  <input
                    type="number"
                    min="0"
                    className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                    placeholder="0"
                    value={newItem.minStockLevel}
                    onChange={(e) => setNewItem({...newItem, minStockLevel: Number(e.target.value)})}
                  />
                </div>
              </div>

              {/* Add Opening Stock Toggle Block */}
              <div className="p-3 bg-gray-50 rounded-xl flex items-center justify-between">
                <span className="text-xs font-extrabold text-gray-800">Add opening stock now</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={addOpeningStock}
                    onChange={(e) => setAddOpeningStock(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
                </label>
              </div>

              {/* Opening Stock Input (Conditional) */}
              {addOpeningStock && (
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Opening Stock Quantity</label>
                  <input
                    type="number"
                    min="0"
                    className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none animate-fade-in"
                    placeholder="0"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({...newItem, quantity: Number(e.target.value)})}
                  />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Notes</label>
                <textarea
                  className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none min-h-[60px]"
                  placeholder="Optional notes..."
                  value={newItem.notes}
                  onChange={(e) => setNewItem({...newItem, notes: e.target.value})}
                />
              </div>

              {/* Save Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex justify-center py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 focus:outline-none disabled:opacity-50 transition-colors shadow-sm mt-3"
              >
                {submitting ? 'Creating Item...' : 'Save Item'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          QUICK STOCK ADJUSTMENT MODAL
          ========================================== */}
      {isAdjustModalOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center p-0 md:p-4">
          <div className="w-full max-w-md bg-white rounded-t-2xl md:rounded-2xl flex flex-col shadow-2xl animate-slide-up">
            
            {/* Header */}
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <div>
                <h3 className="text-base font-extrabold text-gray-950">Adjust Stock Level</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">{selectedItem.itemName}</p>
              </div>
              <button onClick={() => setIsAdjustModalOpen(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAdjustStockSubmit} className="p-5 space-y-4">
              {/* Current Status Badge */}
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center">
                <span className="text-xs font-bold text-gray-500 uppercase">Current balance:</span>
                <span className="text-sm font-extrabold text-gray-800">
                  {selectedItem.quantity} {getUnitAbbreviation(selectedItem.unitId)}
                </span>
              </div>

              {/* Toggle Direction IN / OUT */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Adjustment Action</label>
                <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setAdjustment({ ...adjustment, type: 'IN', reason: 'receive' })}
                    className={`flex items-center justify-center py-2.5 rounded-lg text-xs font-bold transition-all ${
                      adjustment.type === 'IN' 
                        ? 'bg-white text-emerald-600 shadow-sm' 
                        : 'text-gray-500 hover:bg-white/50'
                    }`}
                  >
                    <ArrowUpRight className="h-4 w-4 mr-1 shrink-0" />
                    Receive Stock (IN)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustment({ ...adjustment, type: 'OUT', reason: 'issue' })}
                    className={`flex items-center justify-center py-2.5 rounded-lg text-xs font-bold transition-all ${
                      adjustment.type === 'OUT' 
                        ? 'bg-white text-red-600 shadow-sm' 
                        : 'text-gray-500 hover:bg-white/50'
                    }`}
                  >
                    <ArrowDownLeft className="h-4 w-4 mr-1 shrink-0" />
                    Issue Stock (OUT)
                  </button>
                </div>
              </div>

              {/* Adjustment Quantity */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Quantity ({getUnitAbbreviation(selectedItem.unitId)}) *
                </label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="any"
                  className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                  placeholder="e.g. 10"
                  value={adjustment.qty}
                  onChange={(e) => setAdjustment({ ...adjustment, qty: e.target.value })}
                />
              </div>

              {/* Adjust Reason */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Adjustment Reason *</label>
                <select
                  value={adjustment.reason}
                  onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value as TransactionReason })}
                  className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                >
                  {adjustment.type === 'IN' ? (
                    <>
                      <option value="receive">Purchase / Receive Stock (IN)</option>
                      <option value="adjustment">Stock Audit Increment (IN)</option>
                      <option value="transfer_in">Received from Store Transfer (IN)</option>
                    </>
                  ) : (
                    <>
                      <option value="issue">Issued to Kitchen/Service (OUT)</option>
                      <option value="damage">Spillage / Waste / Damaged (OUT)</option>
                      <option value="adjustment">Stock Audit Decrement (OUT)</option>
                      <option value="transfer_out">Transferred to another Store (OUT)</option>
                    </>
                  )}
                </select>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-4 flex justify-center py-3 px-4 rounded-xl text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 transition-colors shadow-md shadow-orange-500/10"
              >
                {submitting ? 'Applying Adjustment...' : 'Confirm Adjustment'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
