import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  subscribeToCategories, 
  subscribeToDepartments, 
  subscribeToUnits,
  createCategory,
  createDepartment,
  createUnit,
  updateCategory,
  deleteCategory,
  updateDepartment,
  deleteDepartment,
  updateUnit,
  deleteUnit
} from '../../services/dbService';
import { Category, Department, Unit } from '../../types/models';
import { Tags, Layers, Scale, Plus, X, Edit2, Trash2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { validateItemName, validateNotes } from '../../utils/validation';

export const Settings: React.FC = () => {
  const toast = useToast();
  const { profile, isAdmin } = useAuth();
  const { selectedStoreId } = useStore();

  const location = useLocation();
  const navigate = useNavigate();

  const getTabFromPath = (path: string): 'categories' | 'departments' | 'units' => {
    if (path.endsWith('/departments')) return 'departments';
    if (path.endsWith('/units')) return 'units';
    return 'categories';
  };

  const activeTab = getTabFromPath(location.pathname);
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  // Forms states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Shared fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [abbreviation, setAbbreviation] = useState('');

  // Subscriptions
  useEffect(() => {
    setLoading(true);
    const unsubCat = subscribeToCategories(selectedStoreId, (list) => {
      setCategories(list);
      setLoading(false);
    });
    const unsubDept = subscribeToDepartments(selectedStoreId, setDepartments);
    const unsubUnit = subscribeToUnits(selectedStoreId, setUnits);

    return () => {
      unsubCat();
      unsubDept();
      unsubUnit();
    };
  }, [selectedStoreId]);

  const canModify = (item: any) => {
    // `isAdmin` from useAuth is a function that returns a boolean.
    if (isAdmin()) return true;
    // Allow modification (edit/delete) if the item belongs to the currently selected store.
    return !!item.storeId && item.storeId === selectedStoreId;
  };

  const handleOpenAddModal = () => {
    setName('');
    setDescription('');
    setAbbreviation('');
    setEditingId(null);
    setIsAddOpen(true);
  };

  const handleOpenEditModal = (item: any) => {
    setName(item.name || '');
    setDescription(item.description || '');
    setAbbreviation(item.abbreviation || '');
    setEditingId(item.id);
    setIsAddOpen(true);
  };

  const handleDelete = async (id: string, itemName: string) => {
    console.log('handleDelete called for:', itemName, 'id:', id);
    // Directly proceed with deletion (skip confirmation prompt).
    try {
      const performedBy = profile ? { userId: profile.uid, userName: profile.name, userEmail: profile.email } : undefined;
      console.log('calling delete API for activeTab:', activeTab);
      if (activeTab === 'categories') {
        await deleteCategory(id, performedBy);
        toast.showToast(`Category "${itemName}" deleted.`);
      } else if (activeTab === 'departments') {
        await deleteDepartment(id, performedBy);
        toast.showToast(`Department "${itemName}" deleted.`);
      } else if (activeTab === 'units') {
        await deleteUnit(id, performedBy);
        toast.showToast(`Unit "${itemName}" deleted.`);
      }
      console.log('delete API completed successfully');
    } catch (error: any) {
      console.error('delete failed with error:', error);
      const msg = error.message || 'Failed to delete configuration item.';
      toast.showToast(msg, 'error');
      // Show the message in a modal so the user can see it before it disappears.
      window.alert(msg);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.showToast('Name is required.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      validateItemName(name);
      if (description) validateNotes(description);
      
      const performedBy = profile ? { userId: profile.uid, userName: profile.name, userEmail: profile.email } : undefined;

      if (editingId) {
        if (activeTab === 'categories') {
          await updateCategory(editingId, name.trim(), description.trim() || undefined, performedBy);
          toast.showToast(`Category ${name} updated.`);
        } else if (activeTab === 'departments') {
          await updateDepartment(editingId, name.trim(), description.trim() || undefined, performedBy);
          toast.showToast(`Department ${name} updated.`);
        } else if (activeTab === 'units') {
          if (!abbreviation.trim()) {
            toast.showToast('Abbreviation is required for Units.', 'error');
            setSubmitting(false);
            return;
          }
          validateItemName(abbreviation);
          await updateUnit(editingId, name.trim(), abbreviation.trim(), performedBy);
          toast.showToast(`Unit ${name} updated.`);
        }
      } else {
        if (activeTab === 'categories') {
          await createCategory(name.trim(), description.trim() || undefined, selectedStoreId);
          toast.showToast(`Category ${name} added.`);
        } else if (activeTab === 'departments') {
          await createDepartment(name.trim(), description.trim() || undefined, selectedStoreId);
          toast.showToast(`Department ${name} added.`);
        } else if (activeTab === 'units') {
          if (!abbreviation.trim()) {
            toast.showToast('Abbreviation is required for Units.', 'error');
            setSubmitting(false);
            return;
          }
          validateItemName(abbreviation);
          await createUnit(name.trim(), abbreviation.trim(), selectedStoreId);
          toast.showToast(`Unit ${name} added.`);
        }
      }
      setIsAddOpen(false);
      setName('');
      setDescription('');
      setAbbreviation('');
      setEditingId(null);
    } catch (error: any) {
      toast.showToast(error.message || 'Failed to save configuration item.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-gray-900 md:text-2xl">
            System Classifications
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Configure dropdown options for item categories, kitchen departments, and weight units.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="flex items-center justify-center py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 transition-colors shadow-md shadow-orange-500/10 shrink-0"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add Option
        </button>
      </div>

      {/* ==========================================
          MOBILE-FRIENDLY SUB TABS BAR
          ========================================== */}
      <div className="flex bg-gray-100 p-1 rounded-2xl border border-gray-200/50">
        <button
          onClick={() => { navigate('/admin/categories'); setIsAddOpen(false); }}
          className={`flex-1 flex items-center justify-center py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'categories' 
              ? 'bg-white text-orange-500 shadow-sm' 
              : 'text-gray-500 hover:bg-white/40'
          }`}
        >
          <Tags className="h-4 w-4 mr-1.5 shrink-0" />
          Categories
        </button>
        <button
          onClick={() => { navigate('/admin/departments'); setIsAddOpen(false); }}
          className={`flex-1 flex items-center justify-center py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'departments' 
              ? 'bg-white text-orange-500 shadow-sm' 
              : 'text-gray-500 hover:bg-white/40'
          }`}
        >
          <Layers className="h-4 w-4 mr-1.5 shrink-0" />
          Departments
        </button>
        <button
          onClick={() => { navigate('/admin/units'); setIsAddOpen(false); }}
          className={`flex-1 flex items-center justify-center py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'units' 
              ? 'bg-white text-orange-500 shadow-sm' 
              : 'text-gray-500 hover:bg-white/40'
          }`}
        >
          <Scale className="h-4 w-4 mr-1.5 shrink-0" />
          Units
        </button>
      </div>

      {/* ==========================================
          CLASSIFICATIONS DETAILS LISTS
          ========================================== */}
      {loading ? (
        <div className="flex h-[20vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-orange-500 border-t-transparent"></div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
          
          {/* Categories Tab Contents */}
          {activeTab === 'categories' && categories.map((cat) => (
            <div key={cat.id} className="p-4 flex items-center justify-between hover:bg-gray-50/50">
              <div className="flex flex-col">
                <span className="text-xs font-extrabold text-gray-900">{cat.name}</span>
                {cat.description && (
                  <span className="text-[11px] text-gray-400 font-medium mt-0.5 leading-relaxed">{cat.description}</span>
                )}
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                {canModify(cat) && (
                  <>
                    <button
                      onClick={() => handleOpenEditModal(cat)}
                      className="p-2 rounded-lg text-gray-500 hover:text-orange-500 hover:bg-orange-50 transition-colors"
                      title="Edit Category"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id, cat.name)}
                      className="p-2 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete Category"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}

          {/* Departments Tab Contents */}
          {activeTab === 'departments' && departments.map((dept) => (
            <div key={dept.id} className="p-4 flex items-center justify-between hover:bg-gray-50/50">
              <div className="flex flex-col">
                <span className="text-xs font-extrabold text-gray-900">{dept.name}</span>
                {dept.description && (
                  <span className="text-[11px] text-gray-400 font-medium mt-0.5 leading-relaxed">{dept.description}</span>
                )}
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                {canModify(dept) && (
                  <>
                    <button
                      onClick={() => handleOpenEditModal(dept)}
                      className="p-2 rounded-lg text-gray-500 hover:text-orange-500 hover:bg-orange-50 transition-colors"
                      title="Edit Department"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(dept.id, dept.name)}
                      className="p-2 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete Department"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}

          {/* Units Tab Contents */}
          {activeTab === 'units' && units.map((u) => (
            <div key={u.id} className="p-4 flex justify-between items-center hover:bg-gray-50/50">
              <div className="flex items-center space-x-3">
                <span className="text-xs font-extrabold text-gray-900">{u.name}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-gray-100 text-gray-600 border border-gray-200">
                  {u.abbreviation}
                </span>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                {canModify(u) && (
                  <>
                    <button
                      onClick={() => handleOpenEditModal(u)}
                      className="p-2 rounded-lg text-gray-500 hover:text-orange-500 hover:bg-orange-50 transition-colors"
                      title="Edit Unit"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(u.id, u.name)}
                      className="p-2 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete Unit"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}

        </div>
      )}

      {/* ==========================================
          ADD MODAL FOR OPTION
          ========================================== */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center p-0 md:p-4">
          <div className="w-full max-w-md bg-white rounded-t-2xl md:rounded-2xl flex flex-col shadow-2xl animate-slide-up">
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h3 className="text-base font-extrabold text-gray-950 capitalize">
                {editingId ? 'Edit' : 'Add'} {activeTab.replace('ies', 'y').replace('s', '')}
              </h3>
              <button onClick={() => setIsAddOpen(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Name *</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                  placeholder="e.g. Dairy, Kitchen, Kilogram"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {activeTab === 'units' ? (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Unit Abbreviation *</label>
                  <input
                    type="text"
                    required
                    className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                    placeholder="e.g. kg, l, box"
                    value={abbreviation}
                    onChange={(e) => setAbbreviation(e.target.value)}
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Description</label>
                  <textarea
                    rows={2}
                    className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                    placeholder="Brief description details..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-4 flex justify-center py-3 px-4 rounded-xl text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 transition-colors shadow-md shadow-orange-500/10"
              >
                {submitting ? 'Saving...' : 'Save Configuration'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
