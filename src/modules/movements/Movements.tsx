import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { useToast } from '../../context/ToastContext';
import { 
  subscribeToTransactions, 
  subscribeToInventory, 
  subscribeToDepartments, 
  subscribeToUnits, 
  adjustStock, 
  transferStock 
} from '../../services/dbService';
import { Transaction, InventoryItem, Department, Unit } from '../../types/models';
import { 
  ArrowDown, 
  ArrowUp, 
  AlertCircle, 
  ArrowLeftRight, 
  Store as StoreIcon, 
  X
} from 'lucide-react';
import { Timestamp } from 'firebase/firestore';

export const Movements: React.FC = () => {
  const { profile, isAdmin } = useAuth();
  const { stores } = useStore();
  const { showToast } = useToast();

  // Selected store for transaction operations
  const [activeStoreId, setActiveStoreId] = useState<string>('');

  // Selected store for filtering the transactions list
  const [filterStoreId, setFilterStoreId] = useState<string>('');

  // Lists
  const [movements, setMovements] = useState<Transaction[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterType, setFilterType] = useState<string>('');

  // Modals state
  const [activeModal, setActiveModal] = useState<'receive' | 'issue' | 'damage' | 'transfer' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    itemId: '',
    quantity: '',
    departmentId: '',
    toStoreId: '',
    notes: '',
    unitCost: '',
    supplierName: '',
    invoiceNumber: ''
  });

  // Set default stores based on role
  useEffect(() => {
    if (profile) {
      if (isAdmin()) {
        setFilterStoreId(''); // 'All Stores'
        setActiveStoreId('');  // 'Select store'
      } else {
        const userStore = profile.assignedStoreId || '';
        setFilterStoreId(userStore);
        setActiveStoreId(userStore);
      }
    }
  }, [profile, isAdmin]);

  // Subscribe to transactions based on filterStoreId
  useEffect(() => {
    if (!isAdmin() && !filterStoreId) {
      return;
    }
    setLoading(true);
    // Passing null to subscribeToTransactions subscribes to all transactions
    const queryStoreId = filterStoreId === '' ? null : filterStoreId;
    const unsubscribe = subscribeToTransactions(queryStoreId, 100, (list) => {
      setMovements(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [filterStoreId, isAdmin]);

  // Subscribe to active store inventory items (for modals dropdown)
  const [inventoryLoading, setInventoryLoading] = useState(true);
  useEffect(() => {
    if (!activeStoreId) {
      setInventoryItems([]);
      setInventoryLoading(false);
      return;
    }
    setInventoryLoading(true);
    const unsubscribe = subscribeToInventory(activeStoreId, (items) => {
      setInventoryItems(items);
      setInventoryLoading(false);
    });
    return () => unsubscribe();
  }, [activeStoreId]);

  // Subscribe to static lists (departments, units)
  useEffect(() => {
    const unsubDepts = subscribeToDepartments(activeStoreId, setDepartments);
    const unsubUnits = subscribeToUnits(activeStoreId, setUnits);
    return () => {
      unsubDepts();
      unsubUnits();
    };
  }, [activeStoreId]);

  // Helper selectors
  const getUnitAbbreviation = (unitId: string) => {
    return units.find(u => u.id === unitId)?.abbreviation || '';
  };

  const getStoreName = (storeId: string) => {
    return stores.find(s => s.id === storeId)?.name || 'Unknown Store';
  };

  const getDepartmentName = (deptId: string) => {
    return departments.find(d => d.id === deptId)?.name || 'Unknown Department';
  };

  // Check Active Store selection before opening a modal
  const handleOpenModal = (modalType: 'receive' | 'issue' | 'damage' | 'transfer') => {
    if (!activeStoreId) {
      showToast('Select a store first', 'error');
      return;
    }
    setFormData({
      itemId: '',
      quantity: '',
      departmentId: departments[0]?.id || '',
      toStoreId: stores.find(s => s.id !== activeStoreId && s.status !== 'disabled')?.id || '',
      notes: '',
      unitCost: '',
      supplierName: '',
      invoiceNumber: ''
    });
    setActiveModal(modalType);
  };

  // Reset selected item if it becomes invalid after inventory changes
  useEffect(() => {
    if (formData.itemId && !inventoryItems.some(i => i.id === formData.itemId)) {
      setFormData(prev => ({ ...prev, itemId: '' }));
    }
  }, [inventoryItems]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    const qty = Number(formData.quantity);
    if (!formData.itemId) {
      showToast('Please select an item.', 'error');
      return;
    }
    if (activeModal === 'receive') {
      const uCost = Number(formData.unitCost);
      if (isNaN(uCost) || uCost <= 0) {
        showToast('Please enter a valid unit cost greater than zero.', 'error');
        return;
      }
    }

    setSubmitting(true);
    try {
      const performedBy = {
        userId: profile.uid,
        userName: profile.name,
        userEmail: profile.email
      };

      if (activeModal === 'receive') {
        const uCost = Number(formData.unitCost);
        await adjustStock(
          formData.itemId,
          qty,
          'IN',
          'receive',
          performedBy,
          formData.notes || null,
          null,
          null,
          null,
          uCost,
          formData.supplierName ? formData.supplierName.trim() : null,
          formData.invoiceNumber ? formData.invoiceNumber.trim() : null
        );
        showToast('Stock received successfully.');
      } else if (activeModal === 'issue') {
        if (!formData.departmentId) {
          showToast('Please select a department.', 'error');
          setSubmitting(false);
          return;
        }
        await adjustStock(
          formData.itemId,
          qty,
          'OUT',
          'issue',
          performedBy,
          formData.notes || null,
          formData.departmentId
        );
        showToast('Stock issued successfully.');
      } else if (activeModal === 'damage') {
        await adjustStock(
          formData.itemId,
          qty,
          'OUT',
          'damage',
          performedBy,
          formData.notes || null
        );
        showToast('Damage recorded successfully.');
      } else if (activeModal === 'transfer') {
        if (!formData.toStoreId) {
          showToast('Please select a destination store.', 'error');
          setSubmitting(false);
          return;
        }
        await transferStock(
          formData.itemId,
          formData.toStoreId,
          qty,
          performedBy,
          formData.notes || null
        );
        showToast('Stock transferred successfully.');
      }

      setActiveModal(null);
    } catch (err: any) {
      showToast(err.message || 'Action failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter movements
  const filteredMovements = movements.filter(move => {
    if (!filterType) return true;
    if (filterType === 'receive') return move.reason === 'receive' || move.reason === 'transfer_in';
    if (filterType === 'issue') return move.reason === 'issue';
    if (filterType === 'damage') return move.reason === 'damage';
    if (filterType === 'transfer') return move.reason === 'transfer_in' || move.reason === 'transfer_out';
    if (filterType === 'opening') return move.reason === 'opening';
    return true;
  });

  // Group filtered movements by date
  const selectedInvItem = inventoryItems.find(i => i.id === formData.itemId);
  const currentQty = selectedInvItem?.quantity || 0;
  const currentCost = selectedInvItem?.currentWeightedAverageCost ?? selectedInvItem?.costPrice ?? 0;
  const unitLabel = selectedInvItem ? getUnitAbbreviation(selectedInvItem.unitId) : '';
  const rcvQty = Number(formData.quantity) || 0;
  const rcvCost = Number(formData.unitCost) || 0;
  const totalQty = currentQty + rcvQty;
  const newWac = totalQty > 0
    ? Number((((Math.max(0, currentQty) * currentCost) + (rcvQty * rcvCost)) / totalQty).toFixed(2))
    : rcvCost;
  const updatedInventoryValue = totalQty * newWac;

  const groupedMovements: { [dateStr: string]: { date: Date; items: Transaction[] } } = {};
  filteredMovements.forEach(move => {
    const moveDate = move.createdAt instanceof Timestamp ? move.createdAt.toDate() : new Date(move.createdAt as any);
    
    // Custom day/date format (e.g. WED 10 JUN 2026)
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    
    const dateStr = `${days[moveDate.getDay()]} ${moveDate.getDate()} ${months[moveDate.getMonth()]} ${moveDate.getFullYear()}`;
    
    if (!groupedMovements[dateStr]) {
      groupedMovements[dateStr] = {
        date: moveDate,
        items: []
      };
    }
    groupedMovements[dateStr].items.push(move);
  });

  const sortedDates = Object.keys(groupedMovements).sort((a, b) => {
    return groupedMovements[b].date.getTime() - groupedMovements[a].date.getTime();
  });

  return (
    <div className="space-y-6">
      
      {/* Header Info */}
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-gray-900 md:text-2xl">
          Stock Movements
        </h2>
        <p className="text-xs text-gray-500 font-semibold mt-0.5">
          Record and track all stock transactions
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-row flex-wrap md:flex-nowrap gap-3">
        <button
          onClick={() => handleOpenModal('receive')}
          className="bg-[#10B981] hover:bg-[#059669] text-white flex items-center justify-center gap-1.5 py-3 px-6 rounded-xl font-bold text-sm shadow-sm transition-colors flex-1"
        >
          <ArrowDown className="h-4 w-4" />
          Receive
        </button>
        <button
          onClick={() => handleOpenModal('issue')}
          className="bg-[#EA580C] hover:bg-[#C2410C] text-white flex items-center justify-center gap-1.5 py-3 px-6 rounded-xl font-bold text-sm shadow-sm transition-colors flex-1"
        >
          <ArrowUp className="h-4 w-4" />
          Issue
        </button>
        <button
          onClick={() => handleOpenModal('damage')}
          className="bg-[#DC2626] hover:bg-[#B91C1C] text-white flex items-center justify-center gap-1.5 py-3 px-6 rounded-xl font-bold text-sm shadow-sm transition-colors flex-1"
        >
          <AlertCircle className="h-4 w-4" />
          Damage
        </button>
        <button
          onClick={() => handleOpenModal('transfer')}
          className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white flex items-center justify-center gap-1.5 py-3 px-6 rounded-xl font-bold text-sm shadow-sm transition-colors flex-1"
        >
          <ArrowLeftRight className="h-4 w-4" />
          Transfer
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between animate-fade-in">
        <div className="flex flex-col md:flex-row gap-3 flex-1">
          {/* Type Filter */}
          <div className="flex-1 max-w-xs">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
            >
              <option value="">All Types</option>
              <option value="receive">Receive</option>
              <option value="issue">Issue</option>
              <option value="damage">Damage</option>
              <option value="transfer">Transfer</option>
              <option value="opening">Opening Stock</option>
            </select>
          </div>

          {/* Store Filter */}
          <div className="flex-1 max-w-xs">
            <div className="text-[10px] font-bold text-gray-400 mb-1">Store</div>
            {isAdmin() ? (
              <select
                value={filterStoreId}
                onChange={(e) => setFilterStoreId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
              >
                <option value="">All Stores</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            ) : (
              <div className="w-full rounded-xl border border-gray-200 bg-gray-100 px-4 py-2.5 text-xs font-bold text-gray-500">
                {getStoreName(filterStoreId)}
              </div>
            )}
          </div>
        </div>

        {/* Active Store Selector */}
        <div className="w-full md:w-64">
          <div className="text-[10px] font-bold text-gray-400 mb-1">Active Store</div>
          {isAdmin() ? (
            <div className="relative">
              <select
                value={activeStoreId}
                onChange={(e) => setActiveStoreId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-4 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none appearance-none"
              >
                <option value="">Select store</option>
                {stores.filter(s => s.status !== 'disabled').map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
                <StoreIcon className="h-4 w-4" />
              </div>
            </div>
          ) : (
            <div className="relative">
              <div className="w-full rounded-xl border border-gray-200 bg-gray-100 pl-9 pr-4 py-2.5 text-xs font-bold text-gray-500 flex items-center">
                {getStoreName(activeStoreId)}
              </div>
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
                <StoreIcon className="h-4 w-4" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grouped Ledger List */}
      {loading ? (
        <div className="flex h-[30vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-orange-500 border-t-transparent"></div>
        </div>
      ) : sortedDates.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm text-center animate-fade-in">
          <AlertCircle className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-gray-600">No movements found</p>
          <p className="text-xs text-gray-400 mt-1">Adjust your filters or record stock actions.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((dateStr) => {
            const group = groupedMovements[dateStr];
            return (
              <div key={dateStr} className="space-y-3 animate-fade-in">
                {/* Date Header */}
                <div className="flex justify-between items-center border-b border-gray-100 pb-1.5">
                  <span className="text-xs font-extrabold text-gray-500 tracking-wider">
                    {dateStr.toUpperCase()}
                  </span>
                  <span className="bg-gray-100 text-gray-600 text-[10px] font-black h-5 w-5 rounded-full flex items-center justify-center">
                    {group.items.length}
                  </span>
                </div>

                {/* List Items */}
                <div className="space-y-3">
                  {group.items.map((move) => {
                    // Determine badge text and styles
                    let badgeLabel = 'Movement';
                    let badgeStyle = 'bg-gray-50 text-gray-700';

                    if (move.reason === 'opening') {
                      badgeLabel = 'Opening Stock';
                      badgeStyle = 'bg-[#E0F2FE] text-[#0369A1] border border-[#BAE6FD]';
                    } else if (move.reason === 'receive' || move.reason === 'transfer_in') {
                      badgeLabel = 'Received';
                      badgeStyle = 'bg-[#D1FAE5] text-[#047857] border border-[#A7F3D0]';
                    } else if (move.reason === 'issue' || move.reason === 'transfer_out') {
                      badgeLabel = 'Issued';
                      badgeStyle = 'bg-[#FFEDD5] text-[#C2410C] border border-[#FED7AA]';
                    } else if (move.reason === 'damage') {
                      badgeLabel = 'Damaged';
                      badgeStyle = 'bg-[#FEE2E2] text-[#B91C1C] border border-[#FCA5A5]';
                    } else if (move.reason === 'adjustment') {
                      badgeLabel = 'Adjusted';
                      badgeStyle = 'bg-gray-100 text-gray-600 border border-gray-200';
                    }

                    // Store/location logic
                    let locationLabel = getStoreName(move.storeId);
                    if (move.reason === 'issue' && move.departmentId) {
                      locationLabel = `${getStoreName(move.storeId)} → ${getDepartmentName(move.departmentId)}`;
                    } else if (move.reason === 'transfer_out' && move.toStoreId) {
                      locationLabel = `${getStoreName(move.storeId)} → ${getStoreName(move.toStoreId)}`;
                    } else if (move.reason === 'transfer_in' && move.fromStoreId) {
                      locationLabel = `${getStoreName(move.fromStoreId)} → ${getStoreName(move.storeId)}`;
                    }

                    // Find matching inventory item to display unit properly
                    const matchingUnitId = inventoryItems.find(i => i.itemId === move.itemId)?.unitId;
                    const unitLabel = matchingUnitId ? getUnitAbbreviation(matchingUnitId) : '';

                    return (
                      <div 
                        key={move.id} 
                        className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-start justify-between gap-4"
                      >
                        <div className="flex items-start gap-4 min-w-0">
                          {/* Badge */}
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg shrink-0 ${badgeStyle}`}>
                            {badgeLabel}
                          </span>

                          {/* Details */}
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-gray-800 capitalize">
                              {move.itemName}
                            </h4>
                            <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                              {locationLabel}
                            </p>
                            {/* Notes */}
                            {move.notes && (
                              <div className="mt-2 pl-3 border-l-2 border-gray-300 text-xs text-gray-500 font-medium bg-gray-50 py-1 pr-2 rounded-r-md">
                                {move.notes}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Quantity and Operator */}
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-gray-900">
                            {move.quantity} {unitLabel}
                          </p>
                          <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                            {move.performedByName}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals overlay */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-6 relative animate-scale-up">
            {/* Close */}
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Header */}
            <h3 className="text-lg font-bold text-gray-900 mb-4 capitalize">
              {activeModal === 'receive' && 'Receive Stock'}
              {activeModal === 'issue' && 'Issue Stock'}
              {activeModal === 'damage' && 'Record Damage'}
              {activeModal === 'transfer' && 'Transfer Out'}
            </h3>

            {/* Form */}
            <form onSubmit={handleFormSubmit} className="space-y-4">
              {/* Item selection */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Item *
                </label>
                <select
                  value={formData.itemId}
                  onChange={(e) => setFormData({ ...formData, itemId: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                  required
                >
                  <option value="">Select an item...</option>
                  {inventoryItems.map(item => (
                    <option key={item.id} value={item.id}>{item.itemName}</option>
                  ))}
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Quantity *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  placeholder="0"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                  required
                />
              </div>

              {/* Unit Cost, Supplier, and Invoice (Receive Stock only) */}
              {activeModal === 'receive' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Unit Cost (KES) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={formData.unitCost}
                      onChange={(e) => setFormData({ ...formData, unitCost: e.target.value })}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Supplier Name
                    </label>
                    <input
                      type="text"
                      value={formData.supplierName}
                      onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
                      placeholder="e.g., Supplier Company"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Invoice Number
                    </label>
                    <input
                      type="text"
                      value={formData.invoiceNumber}
                      onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                      placeholder="e.g., INV-001"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                </>
              )}

              {/* Department (Issue Stock only) */}
              {activeModal === 'issue' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Department *
                  </label>
                  <select
                    value={formData.departmentId}
                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                    required
                  >
                    <option value="">Select department</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Destination Store (Transfer only) */}
              {activeModal === 'transfer' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Transfer To Store *
                  </label>
                  <select
                    value={formData.toStoreId}
                    onChange={(e) => setFormData({ ...formData, toStoreId: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                    required
                  >
                    <option value="">Destination store</option>
                    {stores
                      .filter(s => s.id !== activeStoreId && s.status !== 'disabled')
                      .map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))
                    }
                  </select>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Optional notes..."
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none h-24 resize-none"
                />
              </div>

              {/* Live Preview Card */}
              {activeModal === 'receive' && selectedInvItem && rcvQty > 0 && rcvCost > 0 && (
                <div className="bg-orange-50/70 border border-orange-100 rounded-2xl p-4 space-y-3 text-xs text-gray-700 shadow-sm animate-fade-in">
                  <h4 className="font-extrabold text-[#C2410C] uppercase tracking-wider text-[10px]">WAC Calculation Preview</h4>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-gray-500 font-semibold">Current Stock:</span>
                      <span className="font-bold text-gray-800">{currentQty} {unitLabel}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 font-semibold">Current Avg Cost:</span>
                      <span className="font-bold text-gray-800">KES {currentCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-orange-100/50 pt-2">
                      <span className="text-gray-500 font-semibold">New Purchase:</span>
                      <span className="font-bold text-gray-800">{rcvQty} {unitLabel} @ KES {rcvCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-orange-100/50 pt-2">
                      <span className="text-[#C2410C] font-bold">New Avg Cost:</span>
                      <span className="text-[#C2410C] font-black text-sm">KES {newWac.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between border-t border-orange-200/50 pt-3 font-black text-gray-900 text-sm">
                    <span>Updated Value:</span>
                    <span className="text-gray-950">KES {updatedInventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#EA580C] hover:bg-[#C2410C] text-white rounded-xl py-3 text-sm font-bold shadow-sm transition-colors mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Confirming...' : (
                  <>
                    {activeModal === 'receive' && 'Confirm Receive Stock'}
                    {activeModal === 'issue' && 'Confirm Issue Stock'}
                    {activeModal === 'damage' && 'Confirm Record Damage'}
                    {activeModal === 'transfer' && 'Confirm Transfer Out'}
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
