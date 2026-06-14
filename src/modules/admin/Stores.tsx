import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToStores, createStore, updateStore } from '../../services/dbService';
import { Store } from '../../types/models';
import { Store as StoreIcon, Plus, X, MapPin, Edit2, Power } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { validateItemName, validateNotes } from '../../utils/validation';

export const Stores: React.FC = () => {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);

  // Form states
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToStores((storesList) => {
      setStores(storesList);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleOpenAdd = () => {
    setName('');
    setLocation('');
    setDescription('');
    setEditingStore(null);
    setIsAddOpen(true);
  };

  const handleOpenEdit = (store: Store) => {
    setName(store.name);
    setLocation(store.location);
    setDescription(store.description || '');
    setEditingStore(store);
    setIsAddOpen(true);
  };

  const handleToggleStatus = async (store: Store) => {
    const isCurrentlyDisabled = store.status === 'disabled';
    const nextStatus = isCurrentlyDisabled ? 'active' : 'disabled';
    const confirmMsg = `Are you sure you want to ${isCurrentlyDisabled ? 'enable' : 'disable'} store "${store.name}"?${!isCurrentlyDisabled ? '\n\nWARNING: All logged-in users assigned to this store will be instantly signed out and restricted from accessing the system.' : ''}`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await updateStore(
        store.id,
        { status: nextStatus },
        {
          userId: profile!.uid,
          userName: profile!.name,
          userEmail: profile!.email
        }
      );
      showToast(`Store "${store.name}" is now ${nextStatus === 'disabled' ? 'disabled' : 'active'}.`);
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle store status.', 'error');
    }
  };

  const handleStoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !location.trim()) {
      showToast('Store name and location are required.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      validateItemName(name);
      validateItemName(location);
      if (description) validateNotes(description);

      const performedBy = {
        userId: profile!.uid,
        userName: profile!.name,
        userEmail: profile!.email
      };

      if (editingStore) {
        await updateStore(
          editingStore.id,
          {
            name: name.trim(),
            location: location.trim(),
            description: description.trim() || undefined
          },
          performedBy
        );
        showToast(`Successfully updated store: ${name}`);
      } else {
        await createStore(
          {
            name: name.trim(),
            location: location.trim(),
            description: description.trim() || undefined,
            status: 'active'
          },
          performedBy
        );
        showToast(`Successfully created store: ${name}`);
      }
      setIsAddOpen(false);
      setName('');
      setLocation('');
      setDescription('');
      setEditingStore(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to save store.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-gray-900 md:text-2xl">
            Store Directory
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Manage physical restaurant kitchens and inventory warehouses.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center justify-center py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 transition-colors shadow-md shadow-orange-500/10 shrink-0"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add Store
        </button>
      </div>

      {/* Stores grid list */}
      {loading ? (
        <div className="flex h-[30vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-orange-500 border-t-transparent"></div>
        </div>
      ) : stores.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm text-center">
          <StoreIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-gray-600">No stores configured</p>
          <p className="text-xs text-gray-400 mt-1">Configure your first restaurant store outlet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stores.map((s) => {
            const isDisabled = s.status === 'disabled';
            return (
              <div key={s.id} className={`bg-white p-6 rounded-2xl border ${isDisabled ? 'border-gray-200 bg-gray-50/50' : 'border-gray-100'} shadow-sm flex flex-col justify-between hover:shadow-md transition-all`}>
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3.5">
                      <div className={`h-11 w-11 rounded-xl ${isDisabled ? 'bg-gray-100 text-gray-500' : 'bg-orange-50 text-orange-600'} flex items-center justify-center shrink-0`}>
                        <StoreIcon className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <h3 className={`text-sm font-extrabold truncate ${isDisabled ? 'text-gray-500' : 'text-gray-900'}`}>{s.name}</h3>
                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">ID: {s.id.substring(0, 8)}</span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md ${isDisabled ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-green-50 text-green-700 border border-green-100'}`}>
                      {isDisabled ? 'Disabled' : 'Active'}
                    </span>
                  </div>
                  
                  <div className="space-y-1.5 text-xs text-gray-600">
                    <p className="flex items-center">
                      <MapPin className="h-4 w-4 mr-2 text-gray-400 shrink-0" />
                      <span className="font-semibold">{s.location}</span>
                    </p>
                    {s.description && (
                      <p className="text-gray-400 font-medium leading-relaxed pl-6">{s.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 mt-5 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => handleOpenEdit(s)}
                    className="flex items-center py-2 px-3.5 rounded-lg text-xs font-bold text-gray-600 hover:text-orange-500 hover:bg-orange-50 transition-colors border border-gray-200 hover:border-orange-100"
                    title="Edit Store Details"
                  >
                    <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggleStatus(s)}
                    className={`flex items-center py-2 px-3.5 rounded-lg text-xs font-bold transition-colors border ${
                      isDisabled 
                        ? 'text-green-600 hover:text-green-700 bg-green-50/30 hover:bg-green-50 border-green-200' 
                        : 'text-red-600 hover:text-red-700 bg-red-50/30 hover:bg-red-50 border-red-200'
                    }`}
                    title={isDisabled ? 'Enable Store' : 'Disable Store'}
                  >
                    <Power className="h-3.5 w-3.5 mr-1.5" />
                    {isDisabled ? 'Enable' : 'Disable'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Store Dialog sheet */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center p-0 md:p-4">
          <div className="w-full max-w-md bg-white rounded-t-2xl md:rounded-2xl flex flex-col shadow-2xl animate-slide-up">
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h3 className="text-base font-extrabold text-gray-950">
                {editingStore ? 'Edit' : 'Add'} Restaurant Store
              </h3>
              <button onClick={() => { setIsAddOpen(false); setEditingStore(null); }} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleStoreSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Store Name *</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                  placeholder="e.g. Store A, Main Warehouse"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Physical Location *</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                  placeholder="e.g. Ground Floor, Block C"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Description</label>
                <textarea
                  rows={2}
                  className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                  placeholder="Add details about this store context..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-4 flex justify-center py-3 px-4 rounded-xl text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 transition-colors shadow-md shadow-orange-500/10"
              >
                {submitting ? 'Saving...' : 'Save Store'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
