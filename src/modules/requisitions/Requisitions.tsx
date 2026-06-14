import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { useToast } from '../../context/ToastContext';
import { 
  subscribeToRequisitions, 
  subscribeToInventory,
  createRequisition, 
  approveRequisition, 
  rejectRequisition, 
  fulfillRequisition, 
  cancelRequisition
} from '../../services/dbService';
import { Requisition, InventoryItem, RequisitionStatus, Store } from '../../types/models';
import { 
  ClipboardList, 
  Plus, 
  X, 
  CheckCircle, 
  XCircle, 
  FileText, 
  Trash2, 
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import { validateItemName, validateNotes, validateQuantity } from '../../utils/validation';
import { formatTimeAgo } from '../../utils/formatters';

export const Requisitions: React.FC = () => {
  const { profile, isAdmin, isStoreUser } = useAuth();
  const { selectedStoreId, stores } = useStore();
  const { showToast } = useToast();

  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal controls
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState<Requisition | null>(null);
  const [issuedQuantities, setIssuedQuantities] = useState<{ [itemId: string]: number }>({});
  const [activeTab, setActiveTab] = useState<'pending' | 'issued'>('pending');
  
  // Rejection sheet control
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const handleSelectRequisition = (req: Requisition) => {
    setSelectedReq(req);
    const qtyMap: { [itemId: string]: number } = {};
    req.items.forEach(item => {
      qtyMap[item.itemId] = item.requestedQty;
    });
    setIssuedQuantities(qtyMap);
  };

  // Form states
  const [submitting, setSubmitting] = useState(false);
  const [targetStoreId, setTargetStoreId] = useState('');
  
  // Dynamic requested items builder array
  const [requestedItems, setRequestedItems] = useState<{
    itemId: string;
    name: string;
    requestedQty: number;
  }[]>([]);

  // Item selector helpers inside builder
  const [selectedBuilderItemId, setSelectedBuilderItemId] = useState('');
  const [builderQty, setBuilderQty] = useState('');

  // Subscriptions
  useEffect(() => {
    if (!isAdmin() && !selectedStoreId) {
      return;
    }
    setLoading(true);
    
    // Subscribe to requisitions
    const unsubscribeReq = subscribeToRequisitions(selectedStoreId, (reqsList) => {
      // Filter list to only show what belongs to current store if not admin
      if (!isAdmin()) {
        const myStoreId = profile?.assignedStoreId;
        const filtered = reqsList.filter(r => r.fromStoreId === myStoreId || r.toStoreId === myStoreId);
        setRequisitions(filtered);
      } else {
        setRequisitions(reqsList);
      }
      setLoading(false);
    }, (error) => {
      console.error('Requisitions subscription failed:', error);
      setLoading(false);
    });

    // Subscribe to local inventory for building items list
    const unsubscribeInv = subscribeToInventory(selectedStoreId, setInventory, (error) => {
      console.error('Local inventory subscription failed in requisitions:', error);
    });

    return () => {
      unsubscribeReq();
      unsubscribeInv();
    };
  }, [selectedStoreId, profile, isAdmin]);

  const handleOpenCreate = () => {
    setTargetStoreId(stores.find(s => s.id !== selectedStoreId)?.id || '');
    setRequestedItems([]);
    setSelectedBuilderItemId('');
    setBuilderQty('');
    setIsCreateOpen(true);
  };

  const handleAddItemToBuilder = () => {
    const item = inventory.find(i => i.id === selectedBuilderItemId);
    const qtyNum = Number(builderQty);

    if (!item) {
      showToast('Please select a valid item.', 'error');
      return;
    }
    
    try {
      validateItemName(item.itemName);
      validateQuantity(qtyNum);
    } catch (err: any) {
      showToast(err.message, 'error');
      return;
    }

    // Check duplicate
    if (requestedItems.some(i => i.itemId === item.itemId)) {
      showToast('Item is already in the requisition list. Edit or remove it.', 'info');
      return;
    }

    setRequestedItems([
      ...requestedItems,
      { itemId: item.itemId, name: item.itemName, requestedQty: qtyNum }
    ]);
    setSelectedBuilderItemId('');
    setBuilderQty('');
  };

  const handleRemoveItemFromBuilder = (itemId: string) => {
    setRequestedItems(requestedItems.filter(i => i.itemId !== itemId));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStoreId) return;

    if (!targetStoreId) {
      showToast('Please select a supplying store.', 'error');
      return;
    }
    if (requestedItems.length === 0) {
      showToast('Please add at least one item to request.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await createRequisition(
        selectedStoreId,
        targetStoreId,
        requestedItems,
        {
          userId: profile!.uid,
          userName: profile!.name,
          userEmail: profile!.email
        }
      );
      showToast('Requisition request created successfully.');
      setIsCreateOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to create requisition.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (req: Requisition) => {
    setSubmitting(true);
    try {
      await approveRequisition(req.id, {
        userId: profile!.uid,
        userName: profile!.name,
        userEmail: profile!.email
      });
      showToast('Requisition approved.');
      setSelectedReq(prev => prev ? { ...prev, status: 'approved' } : null);
    } catch (err: any) {
      showToast(err.message || 'Approval failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq || !rejectionReason.trim()) return;

    setSubmitting(true);
    try {
      validateNotes(rejectionReason);
      await rejectRequisition(selectedReq.id, rejectionReason.trim(), {
        userId: profile!.uid,
        userName: profile!.name,
        userEmail: profile!.email
      });
      showToast('Requisition rejected.');
      setIsRejecting(false);
      setRejectionReason('');
      setSelectedReq(prev => prev ? { ...prev, status: 'rejected', rejectionReason } : null);
    } catch (err: any) {
      showToast(err.message || 'Rejection failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFulfill = async (req: Requisition) => {
    setSubmitting(true);
    try {
      const customIssued = req.items.map(item => ({
        itemId: item.itemId,
        fulfilledQty: issuedQuantities[item.itemId] !== undefined ? issuedQuantities[item.itemId] : item.requestedQty
      }));

      await fulfillRequisition(req.id, {
        userId: profile!.uid,
        userName: profile!.name,
        userEmail: profile!.email
      }, customIssued);
      showToast('Requisition fulfilled. Inventory balances and ledgers updated.');
      setSelectedReq(null); // Close details modal on success
    } catch (err: any) {
      showToast(err.message || 'Fulfillment failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (req: Requisition) => {
    setSubmitting(true);
    try {
      await cancelRequisition(req.id, {
        userId: profile!.uid,
        userName: profile!.name,
        userEmail: profile!.email
      });
      showToast('Requisition cancelled.');
      setSelectedReq(prev => prev ? { ...prev, status: 'cancelled' } : null);
    } catch (err: any) {
      showToast(err.message || 'Cancellation failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Helper resolvers
  const getStoreName = (id: string) => stores.find(s => s.id === id)?.name || `Store (${id.substring(0, 5)})`;
  
  const getStatusColor = (status: RequisitionStatus) => {
    switch (status) {
      case 'pending': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'approved': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'fulfilled': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'rejected': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'cancelled': return 'bg-slate-50 text-slate-500 border-slate-200';
      default: return 'bg-gray-50 text-gray-500 border-gray-200';
    }
  };

  // Permission flags for active requisition item details
  const isFromStore = selectedReq?.fromStoreId === profile?.assignedStoreId;
  const isToStore = selectedReq?.toStoreId === profile?.assignedStoreId;
  const canPerformAction = isAdmin() || isStoreUser();

  const displayedRequisitions = requisitions.filter(req => {
    if (activeTab === 'pending') {
      return req.status === 'pending' || req.status === 'approved';
    } else {
      return req.status === 'fulfilled' || req.status === 'rejected' || req.status === 'cancelled';
    }
  });

  return (
    <div className="space-y-6">
      
      {/* Header Info */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-gray-900 md:text-2xl">
            Requisition Requests
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Request stock from other stores, or approve and fulfill incoming inventory transfers.
          </p>
        </div>

        {/* Create Requisition Trigger (Only if not global admin without store context) */}
        {selectedStoreId && (
          <button
            onClick={handleOpenCreate}
            className="flex items-center justify-center py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 transition-colors shadow-md shadow-orange-500/10 shrink-0"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Request Stock
          </button>
        )}
      </div>

      {/* Toggle Tab Bar */}
      <div className="flex bg-gray-100/60 p-1 rounded-xl max-w-xs border border-gray-200/40">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeTab === 'pending'
              ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/10'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          Pending
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('issued')}
          className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeTab === 'issued'
              ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/10'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          Issued
        </button>
      </div>

      {/* ==========================================
          REQUISITIONS LIST
          ========================================== */}
      {loading ? (
        <div className="flex h-[30vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-orange-500 border-t-transparent"></div>
        </div>
      ) : displayedRequisitions.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm text-center">
          <ClipboardList className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-gray-600">
            No {activeTab} requisitions found
          </p>
          <p className="text-xs text-gray-400 mt-1">Requisitions from your store or sent to you will list here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedRequisitions.map((req) => {
            const incoming = req.toStoreId === selectedStoreId;
            return (
              <div 
                key={req.id} 
                onClick={() => handleSelectRequisition(req)}
                className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md cursor-pointer transition-all active:scale-[0.99]"
              >
                <div className="space-y-3">
                  {/* Status & Date Bar */}
                  <div className="flex justify-between items-center">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider ${getStatusColor(req.status)}`}>
                      {req.status === 'fulfilled' ? 'issued' : req.status}
                    </span>
                    <span className="text-[10px] text-gray-400 font-semibold">
                      {formatTimeAgo(req.createdAt)}
                    </span>
                  </div>

                  {/* Flow Details */}
                  <div className="flex items-center space-x-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Requester</p>
                      <p className="text-xs font-bold text-gray-800 truncate">{getStoreName(req.fromStoreId)}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-300 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Supplier</p>
                      <p className="text-xs font-bold text-gray-800 truncate">{getStoreName(req.toStoreId)}</p>
                    </div>
                  </div>
                </div>

                {/* Items & Indicator Badging */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
                  <span className="text-xs text-gray-500 font-semibold">
                    {req.items.length} {req.items.length === 1 ? 'item' : 'items'}
                  </span>
                  
                  {incoming && req.status === 'pending' && (
                    <span className="text-[10px] font-black text-orange-600 animate-pulse bg-orange-50 px-2 py-0.5 rounded uppercase">
                      Action Required
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==========================================
          CREATE REQUISITION MODAL (DRAWER)
          ========================================== */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center p-0 md:p-4">
          <div className="w-full max-w-lg bg-white rounded-t-2xl md:rounded-2xl flex flex-col max-h-[90vh] shadow-2xl animate-slide-up">
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h3 className="text-base font-extrabold text-gray-950">New Stock Requisition</h3>
              <button onClick={() => setIsCreateOpen(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
              
              {/* Supply Store Select */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Select Supplying Store *</label>
                <select
                  required
                  value={targetStoreId}
                  onChange={(e) => setTargetStoreId(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                >
                  {stores.filter(s => s.id !== selectedStoreId).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Items Builder Box */}
              <div className="p-4 rounded-xl border border-gray-100 bg-gray-50 space-y-3">
                <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Build Requisition List</p>
                
                <div className="flex gap-2">
                  <div className="flex-1">
                    <select
                      value={selectedBuilderItemId}
                      onChange={(e) => setSelectedBuilderItemId(e.target.value)}
                      className="block w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                    >
                      <option value="">Select inventory item...</option>
                      {inventory.map((i) => (
                        <option key={i.id} value={i.id}>{i.itemName}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="w-20">
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      placeholder="Qty"
                      value={builderQty}
                      onChange={(e) => setBuilderQty(e.target.value)}
                      className="block w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddItemToBuilder}
                    className="px-3.5 py-2 rounded-lg bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 transition-colors shrink-0"
                  >
                    Add
                  </button>
                </div>

                {/* Builder items list preview */}
                {requestedItems.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto pt-2 border-t border-gray-200">
                    {requestedItems.map((item) => (
                      <div key={item.itemId} className="flex justify-between items-center p-2 rounded bg-white border border-gray-100">
                        <span className="text-xs font-bold text-gray-800">{item.name}</span>
                        <div className="flex items-center space-x-3 text-xs font-extrabold">
                          <span className="text-gray-900">{item.requestedQty}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveItemFromBuilder(item.itemId)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-400 font-semibold text-center py-2">No items added to request list yet.</p>
                )}
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={submitting || requestedItems.length === 0}
                className="w-full mt-4 flex justify-center py-3 px-4 rounded-xl text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 transition-colors shadow-md shadow-orange-500/10"
              >
                {submitting ? 'Submitting Request...' : 'Submit Requisition'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          REQUISITION DETAIL SHEET (MODAL OVERLAY)
          ========================================== */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center p-0 md:p-4">
          <div className="w-full max-w-lg bg-white rounded-t-2xl md:rounded-2xl flex flex-col max-h-[90vh] shadow-2xl animate-slide-up">
            
            {/* Header */}
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <div>
                <h3 className="text-base font-extrabold text-gray-950">Requisition Details</h3>
                <span className="text-[10px] text-gray-400 font-black tracking-wider uppercase">ID: {selectedReq.id}</span>
              </div>
              <button onClick={() => { setSelectedReq(null); setIsRejecting(false); }} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable details */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Flows & Status Banner */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50">
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Requested From</p>
                  <p className="text-xs font-black text-gray-800">{getStoreName(selectedReq.fromStoreId)}</p>
                  <p className="text-[9px] text-gray-400 font-semibold mt-0.5">By {selectedReq.requestedByName}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Supplied By</p>
                  <p className="text-xs font-black text-gray-800">{getStoreName(selectedReq.toStoreId)}</p>
                  {selectedReq.approvedByName && (
                    <p className="text-[9px] text-gray-400 font-semibold mt-0.5">Approved by {selectedReq.approvedByName}</p>
                  )}
                </div>
              </div>

              {/* Status Indicator */}
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-gray-500 uppercase">Status:</span>
                <span className={`px-2.5 py-1 rounded-xl text-xs font-black border uppercase ${getStatusColor(selectedReq.status)}`}>
                  {selectedReq.status === 'fulfilled' ? 'issued' : selectedReq.status}
                </span>
              </div>

              {/* Rejection notice box */}
              {selectedReq.status === 'rejected' && selectedReq.rejectionReason && (
                <div className="p-3 bg-rose-50 border border-rose-100 text-xs font-bold text-rose-700 rounded-xl flex items-start space-x-2">
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="uppercase text-[9px] tracking-wider font-extrabold text-rose-800">Rejection Reason</p>
                    <p className="font-semibold mt-0.5">{selectedReq.rejectionReason}</p>
                  </div>
                </div>
              )}

              {/* Items Table */}
               <div className="space-y-2">
                 <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Requested Items</p>
                 <div className="rounded-xl border border-gray-100 overflow-hidden">
                   <table className="min-w-full divide-y divide-gray-100 text-left text-xs">
                     <thead className="bg-gray-50">
                       <tr>
                         <th className="px-4 py-2 font-bold text-gray-400 uppercase">Item Name</th>
                         <th className="px-4 py-2 font-bold text-gray-400 uppercase text-right">Requested Qty</th>
                         <th className="px-4 py-2 font-bold text-gray-400 uppercase text-right">Issued Qty</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100 bg-white">
                       {selectedReq.items.map((item) => (
                         <tr key={item.itemId}>
                           <td className="px-4 py-3 font-semibold text-gray-700">{item.name}</td>
                           <td className="px-4 py-3 font-black text-gray-950 text-right">{item.requestedQty}</td>
                           {selectedReq.status === 'pending' || selectedReq.status === 'approved' ? (
                             <td className="px-4 py-2 text-right">
                               <input
                                 type="number"
                                 min="0"
                                 step="any"
                                 className="w-20 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-bold text-gray-800 text-right focus:border-orange-500 focus:outline-none"
                                 value={issuedQuantities[item.itemId] !== undefined ? issuedQuantities[item.itemId] : item.requestedQty}
                                 onChange={(e) => {
                                   const val = Number(e.target.value);
                                   setIssuedQuantities({
                                     ...issuedQuantities,
                                     [item.itemId]: isNaN(val) ? 0 : val
                                   });
                                 }}
                               />
                             </td>
                           ) : (
                             <td className={`px-4 py-3 font-black text-right ${selectedReq.status === 'fulfilled' ? 'text-emerald-600' : 'text-gray-500'}`}>
                               {item.fulfilledQty || 0}
                             </td>
                           )}
                         </tr>
                       ))}
                     </tbody>
                   </table>
                </div>
              </div>

              {/* ==========================================
                  REJECTION SHEET FORM (IF ACTIVE REJECT ACTION)
                  ========================================== */}
              {isRejecting && (
                <form onSubmit={handleReject} className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Reason for Rejection *</label>
                  <textarea
                    required
                    rows={2}
                    className="block w-full rounded-lg border border-gray-200 bg-white p-2 text-xs font-medium focus:border-orange-500 focus:outline-none"
                    placeholder="Enter reason..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                  />
                  <div className="flex justify-end space-x-2">
                    <button
                      type="button"
                      onClick={() => setIsRejecting(false)}
                      className="px-3 py-1.5 rounded-lg border text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all"
                    >
                      Confirm Reject
                    </button>
                  </div>
                </form>
              )}

              {/* ==========================================
                  WORKFLOW ACTION TRIGGERS
                  ========================================== */}
              {!isRejecting && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  {/* Supplying Store controls (Manager / Admin of supplying store) */}
                  {selectedReq.status === 'pending' && (isToStore || isAdmin()) && canPerformAction && (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setIsRejecting(true)}
                        className="py-3 flex justify-center items-center rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-all"
                      >
                        <XCircle className="h-4 w-4 mr-1.5 shrink-0" />
                        Reject Request
                      </button>
                      <button
                        onClick={() => handleFulfill(selectedReq)}
                        disabled={submitting}
                        className="py-3 flex justify-center items-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/10"
                      >
                        <CheckCircle className="h-4 w-4 mr-1.5 shrink-0" />
                        Issue & Transfer
                      </button>
                    </div>
                  )}

                  {/* Fulfill action (After approved) */}
                  {selectedReq.status === 'approved' && (isToStore || isAdmin()) && canPerformAction && (
                    <button
                      onClick={() => handleFulfill(selectedReq)}
                      disabled={submitting}
                      className="w-full py-3 flex justify-center items-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/10"
                    >
                      <CheckCircle className="h-4 w-4 mr-1.5 shrink-0" />
                      Issue & Transfer Stock
                    </button>
                  )}

                  {/* Requesting Store controls (Cancel requisition) */}
                  {selectedReq.status === 'pending' && isFromStore && (
                    <button
                      onClick={() => handleCancel(selectedReq)}
                      disabled={submitting}
                      className="w-full py-3 flex justify-center items-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 text-xs font-bold transition-all"
                    >
                      <XCircle className="h-4 w-4 mr-1.5 shrink-0" />
                      Cancel Requisition Request
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
