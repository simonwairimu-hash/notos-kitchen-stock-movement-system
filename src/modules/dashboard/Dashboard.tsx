import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { 
  subscribeToInventory, 
  subscribeToTransactions, 
  subscribeToUsers,
  subscribeToCategories,
  subscribeToUnits
} from '../../services/dbService';
import { InventoryItem, Transaction, UserProfile, Category, Unit } from '../../types/models';
import { 
  Package, 
  AlertTriangle, 
  Store, 
  TrendingUp, 
  ArrowRight,
  RefreshCw,
  Plus,
  CheckCircle2,
  Users,
  Layers
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export const Dashboard: React.FC = () => {
  const { profile, isAdmin } = useAuth();
  const { selectedStoreId, selectedStore, stores } = useStore();
  const navigate = useNavigate();

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [recentMovements, setRecentMovements] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  // Load data depending on roles
  useEffect(() => {
    if (!isAdmin() && !selectedStoreId) {
      return;
    }
    // Prevent cascading render by only setting true if not already true
    setLoading(prev => prev ? prev : true);
    
    let unsubscribeInv: () => void;
    let unsubscribeMove: () => void;
    let unsubscribeUsers: (() => void) | null = null;
    const unsubCat = subscribeToCategories(selectedStoreId, setCategories);
    const unsubUnits = subscribeToUnits(selectedStoreId, setUnits);

    if (isAdmin()) {
      // Admin reads global datasets
      unsubscribeInv = subscribeToInventory(null, (items) => {
        setInventory(items);
        setLoading(false);
      });
      unsubscribeMove = subscribeToTransactions(null, 10, (moves) => {
        setRecentMovements(moves);
      });
      unsubscribeUsers = subscribeToUsers((usersList) => {
        setUsers(usersList);
      });
    } else {
      // Store User reads store-specific dataset
      unsubscribeInv = subscribeToInventory(selectedStoreId, (items) => {
        setInventory(items);
        setLoading(false);
      });
      unsubscribeMove = subscribeToTransactions(selectedStoreId, 10, (moves) => {
        setRecentMovements(moves);
      });
    }

    return () => {
      if (unsubscribeInv) unsubscribeInv();
      if (unsubscribeMove) unsubscribeMove();
      if (unsubscribeUsers) unsubscribeUsers();
      unsubCat();
      unsubUnits();
    };
  }, [selectedStoreId, profile, isAdmin]);

  // Compute metrics
  const totalItems = inventory.length;
  const totalValuation = inventory.reduce((sum, item) => sum + (item.quantity * (item.currentWeightedAverageCost ?? item.costPrice ?? 0)), 0);
  const lowStockCount = inventory.filter(item => item.quantity <= item.minStockLevel).length;
  const totalStores = stores.length;
  const totalUsers = users.length;
  const uniqueCategoriesUsed = new Set(inventory.map(item => item.categoryId)).size;
  const lowStockItems = inventory.filter(item => item.quantity <= item.minStockLevel);
  
  const totalInventoryValueAdmin = totalValuation;
  const lowStockAcrossStores = lowStockCount;
  const recentMovementsCount = recentMovements.length;

  // Map stores by ID for lookup
  const getStoreName = (id: string) => {
    return stores.find(s => s.id === id)?.name || 'Unknown Store';
  };

  // Unit lookup by Item ID helper
  const getUnitNameByItemId = (itemId: string) => {
    const invItem = inventory.find(item => item.itemId === itemId);
    if (invItem) {
      return units.find(u => u.id === invItem.unitId)?.abbreviation || '';
    }
    return '';
  };

  // Transaction time formatter: e.g. "Wed 10 Jun 2026 20:32"
  const formatTxTime = (timestamp: any) => {
    if (!timestamp) return '';
    let date: Date;
    if (typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else if (typeof timestamp === 'object' && timestamp.seconds !== undefined) {
      date = new Date(timestamp.seconds * 1000);
    } else {
      date = new Date(timestamp);
    }
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const dName = dayNames[date.getDay()];
    const day = date.getDate();
    const mName = monthNames[date.getMonth()];
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${dName} ${day} ${mName} ${year} ${hours}:${minutes}`;
  };

  // Format large numbers with commas
  const formatNumberWithCommas = (value: number) => {
    return new Intl.NumberFormat('en-KE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  // Maps transaction types/reasons to badges (label and styling colors)
  const getTxBadge = (type: string, reason: string) => {
    switch (reason) {
      case 'opening':
        return { label: 'Opening Stock', classes: 'bg-blue-50 text-blue-700 border-blue-100' };
      case 'receive':
        return { label: 'Received', classes: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
      case 'issue':
        return { label: 'Issued', classes: 'bg-amber-50 text-amber-700 border-amber-100' };
      case 'damage':
        return { label: 'Damaged', classes: 'bg-rose-50 text-rose-700 border-rose-100' };
      case 'transfer_in':
        return { label: 'Transfer In', classes: 'bg-indigo-50 text-indigo-700 border-indigo-100' };
      case 'transfer_out':
        return { label: 'Transfer Out', classes: 'bg-slate-100 text-slate-700 border-slate-200' };
      case 'adjustment':
        return { label: 'Adjusted', classes: 'bg-purple-50 text-purple-700 border-purple-100' };
      default:
        return type === 'IN'
          ? { label: 'Received', classes: 'bg-emerald-50 text-emerald-700 border-emerald-100' }
          : { label: 'Issued', classes: 'bg-amber-50 text-amber-700 border-amber-100' };
    }
  };

  // Admin store performance overview calculation
  const storePerformance = stores.map(store => {
    const storeItems = inventory.filter(item => item.storeId === store.id);
    const storeVal = storeItems.reduce((sum, item) => sum + (item.quantity * (item.currentWeightedAverageCost ?? item.costPrice ?? 0)), 0);
    return {
      id: store.id,
      name: store.name,
      itemsCount: storeItems.length,
      valuation: storeVal
    };
  }).sort((a, b) => b.valuation - a.valuation);

  if (loading) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-orange-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col justify-between sm:flex-row sm:items-center space-y-3 sm:space-y-0">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-gray-900 md:text-2xl">
            {isAdmin() ? 'Admin Dashboard' : 'Store Dashboard'}
          </h2>
          <p className="text-xs font-semibold text-gray-500 mt-0.5">
            Welcome back, <span className="text-gray-700">{profile?.name || profile?.email}</span>
          </p>
        </div>
        
        {/* Quick action button (Always visible to trigger inventory action) */}
        <div>
          <Link
            to="/inventory"
            className="flex items-center justify-center px-4 py-2 rounded-xl text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add Item
          </Link>
        </div>
      </div>

      {/* ==========================================
          STATS CARDS GRID
          ========================================== */}
      {isAdmin() ? (
        // ADMIN CARDS
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Items</p>
              <h3 className="text-2xl font-black text-gray-950 mt-1">{totalItems}</h3>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Package className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Low Stock</p>
              <h3 className="text-2xl font-black text-gray-950 mt-1">{lowStockAcrossStores}</h3>
            </div>
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
              lowStockAcrossStores > 0 ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-green-50 text-green-600'
            }`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Stores</p>
              <h3 className="text-2xl font-black text-gray-950 mt-1">{totalStores}</h3>
            </div>
            <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <Store className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Inventory Value</p>
              <div className="mt-1">
                <div className="text-xs font-bold text-gray-400">KES</div>
                <h3 className="text-2xl font-black text-gray-950 leading-none">
                  {formatNumberWithCommas(totalInventoryValueAdmin)}
                </h3>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
        </div>
      ) : (
        // STORE USER CARDS
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Items</p>
              <h3 className="text-2xl font-black text-gray-950 mt-1">{totalItems}</h3>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Package className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Low Stock</p>
              <h3 className="text-2xl font-black text-gray-950 mt-1">{lowStockCount}</h3>
            </div>
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
              lowStockCount > 0 ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-green-50 text-green-600'
            }`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Inventory Value</p>
              <div className="mt-1">
                <div className="text-xs font-bold text-gray-400">KES</div>
                <h3 className="text-2xl font-black text-gray-950 leading-none">
                  {formatNumberWithCommas(totalValuation)}
                </h3>
              </div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Stock Movements</p>
              <h3 className="text-2xl font-black text-gray-950 mt-1">{recentMovementsCount}</h3>
            </div>
            <div className="h-10 w-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
              <RefreshCw className="h-5 w-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between col-span-2 md:col-span-1">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Categories Used</p>
              <h3 className="text-2xl font-black text-gray-950 mt-1">{uniqueCategoriesUsed}</h3>
            </div>
            <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <Layers className="h-5 w-5" />
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          DASHBOARD MAIN DETAILS PANELS
          ========================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Panel: Low Stock Alerts */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col h-[420px]">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-800 flex items-center">
              Low Stock Alerts
              <span className={`ml-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                lowStockCount > 0 ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-600'
              }`}>
                {lowStockCount}
              </span>
            </h4>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
            {lowStockItems.length === 0 ? (
              <div className="flex flex-col h-full items-center justify-center text-center space-y-2 text-gray-400">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                <p className="text-sm font-bold text-gray-700">All items are well stocked</p>
                <p className="text-xs text-gray-400">Inventory levels are above reorder thresholds.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {lowStockItems.map((item) => {
                  const storeName = getStoreName(item.storeId);
                  const catName = categories.find(c => c.id === item.categoryId)?.name || 'Others';
                  const unitAbr = units.find(u => u.id === item.unitId)?.abbreviation || '';
                  return (
                    <div 
                      key={item.id} 
                      className="flex justify-between items-center p-3 rounded-xl bg-red-50/50 border border-red-100 hover:bg-red-50 transition-colors"
                    >
                      <div>
                        <p className="text-xs font-bold text-gray-950">{item.itemName}</p>
                        <p className="text-[10px] text-gray-400 font-semibold uppercase mt-0.5">
                          {storeName} · {catName}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-red-600">{item.quantity} {unitAbr}</p>
                        <p className="text-[10px] text-gray-400 font-semibold mt-0.5">Min: {item.minStockLevel}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Recent Movements */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col h-[420px]">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-800">Recent Movements</h4>
            </div>
            <Link 
              to="/movements" 
              className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center transition-colors shrink-0"
            >
              View All
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
            {recentMovements.length === 0 ? (
              <div className="flex flex-col h-full items-center justify-center text-center text-gray-400 space-y-1">
                <RefreshCw className="h-8 w-8 text-gray-300 animate-spin-slow mb-2" />
                <p className="text-sm font-bold text-gray-600">No stock movement activity</p>
                <p className="text-xs text-gray-400">Stock updates will show up here in real time.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentMovements.map((move) => {
                  const badge = getTxBadge(move.type, move.reason);
                  const storeName = getStoreName(move.storeId);
                  const unitAbr = getUnitNameByItemId(move.itemId);
                  
                  return (
                    <div key={move.id} className="flex justify-between items-center text-xs pb-3 border-b border-gray-50 last:border-b-0 last:pb-0">
                      <div className="flex items-center space-x-3 min-w-0">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 border uppercase tracking-wider whitespace-nowrap ${badge.classes}`}>
                          {badge.label}
                        </span>
                        <div className="min-w-0">
                          <p className="font-extrabold text-gray-900 truncate">{move.itemName}</p>
                          <p className="text-[10px] text-gray-400 font-semibold mt-0.5">{storeName}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-gray-900">{move.quantity} {unitAbr}</p>
                        <p className="text-[9px] text-gray-400 font-semibold mt-0.5">{formatTxTime(move.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Admin store performance overview */}
      {isAdmin() && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col">
          <div className="mb-4 shrink-0">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-800">Store Performance Overview</h4>
            <p className="text-[10px] text-gray-400 font-semibold mt-0.5">Summary of item counts and financial valuations per outlet</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-left text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 font-bold text-gray-400 uppercase">Store Name</th>
                  <th scope="col" className="px-4 py-3 font-bold text-gray-400 uppercase text-right">Items</th>
                  <th scope="col" className="px-4 py-3 font-bold text-gray-400 uppercase text-right">Valuation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {storePerformance.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-bold text-gray-800">{item.name}</td>
                    <td className="px-4 py-3 font-extrabold text-gray-500 text-right">{item.itemsCount}</td>
                    <td className="px-4 py-3 font-black text-gray-900 text-right">{formatCurrency(item.valuation)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
