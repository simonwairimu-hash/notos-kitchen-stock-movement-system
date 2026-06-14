import React, { useState, useEffect } from 'react';
import { useStore } from '../../context/StoreContext';
import { useAuth } from '../../context/AuthContext';
import { 
  subscribeToInventory, 
  subscribeToCategories, 
  subscribeToDepartments,
  subscribeToTransactions,
  subscribeToRequisitions,
  subscribeToCatalogItems,
  subscribeToUnits
} from '../../services/dbService';
import { InventoryItem, Category, Department, Transaction, Requisition, CatalogItem, Unit } from '../../types/models';
import { 
  FileSpreadsheet,
  FileText,
  Clock,
  ArrowRightLeft,
  Search,
  Filter,
  RefreshCw,
  FolderKanban,
  PieChart,
  BarChart3,
  AlertTriangle
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { useToast } from '../../context/ToastContext';
import { Timestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';

export const Reports: React.FC = () => {
  const { stores, selectedStoreId, selectedStore } = useStore();
  const { isAdmin, profile } = useAuth();
  const { showToast } = useToast();

  // Active Report Section Tab
  const [activeTab, setActiveTab] = useState<'inventory' | 'movements' | 'low_stock' | 'damage' | 'requisitions' | 'dept_usage'>('inventory');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Core Data Lists
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  
  // Date selection states: default to 30 days ago to today
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  });
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Synchronize storeFilter with selectedStoreId on mount or scope change
  useEffect(() => {
    if (isAdmin()) {
      setStoreFilter(selectedStoreId || 'all');
    } else if (profile?.assignedStoreId) {
      setStoreFilter(profile.assignedStoreId);
    }
  }, [selectedStoreId, profile, isAdmin]);

  // Real-time Database Subscriptions
  useEffect(() => {
    // If not admin and storeFilter is 'all', DO NOT subscribe yet.
    // Wait until storeFilter is synced to the user's assigned store.
    if (!isAdmin() && storeFilter === 'all') {
      return;
    }

    setLoading(true);
    const storeIdArg = storeFilter === 'all' ? null : storeFilter;
    
    const unsubInv = subscribeToInventory(storeIdArg, (items) => {
      setInventory(items);
    }, (error) => {
      console.error('Inventory subscription error:', error);
      setLoading(false);
    });

    const unsubCat = subscribeToCategories(storeIdArg, setCategories);
    const unsubDept = subscribeToDepartments(storeIdArg, setDepartments);
    const unsubUnits = subscribeToUnits(storeIdArg, setUnits);
    const unsubCatalog = subscribeToCatalogItems(setCatalogItems);

    const unsubTx = subscribeToTransactions(storeIdArg, 2000, (txs) => {
      setTransactions(txs);
      setLoading(false);
    }, (error) => {
      console.error('Transactions subscription error:', error);
      setLoading(false);
    });

    const unsubReq = subscribeToRequisitions(storeIdArg, (reqs) => {
      setRequisitions(reqs);
    }, (error) => {
      console.error('Requisitions subscription error:', error);
    });

    return () => {
      unsubInv();
      unsubCat();
      unsubDept();
      unsubUnits();
      unsubTx();
      unsubReq();
      unsubCatalog();
    };
  }, [storeFilter, profile, isAdmin]);

  const handleResetFilters = () => {
    setCategoryFilter('all');
    setDepartmentFilter('all');
    setSearchQuery('');
    
    // Reset dates to last 30 days
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setStartDate(`${d.getFullYear()}-${m}-${day}`);

    const today = new Date();
    const todayM = String(today.getMonth() + 1).padStart(2, '0');
    const todayDay = String(today.getDate()).padStart(2, '0');
    setEndDate(`${today.getFullYear()}-${todayM}-${todayDay}`);

    if (isAdmin()) {
      setStoreFilter('all');
    }
  };

  const getCatalogInfo = (itemId: string) => {
    return catalogItems.find(c => c.id === itemId);
  };

  const getStoreName = (id: string) => {
    return stores.find(st => st.id === id)?.name || 'Unknown Store';
  };

  const getDepartmentName = (id: string) => {
    return departments.find(d => d.id === id)?.name || 'General';
  };

  const getUnitAbbreviation = (id: string) => {
    return units.find(u => u.id === id)?.abbreviation || '';
  };

  // Date Formatting Helpers
  const formatReportDate = (timestamp: any): string => {
    if (!timestamp) return '';
    let date: Date;
    if (timestamp instanceof Timestamp) {
      date = timestamp.toDate();
    } else if (typeof timestamp === 'object' && timestamp.seconds !== undefined) {
      date = new Timestamp(timestamp.seconds, timestamp.nanoseconds).toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      date = new Date(timestamp);
    } else {
      return '';
    }
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const getDayName = (timestamp: any): string => {
    if (!timestamp) return '';
    let date: Date;
    if (timestamp instanceof Timestamp) {
      date = timestamp.toDate();
    } else if (typeof timestamp === 'object' && timestamp.seconds !== undefined) {
      date = new Timestamp(timestamp.seconds, timestamp.nanoseconds).toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      date = new Date(timestamp);
    }
    const fullDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return fullDays[date.getDay()];
  };

  const formatReportTime = (timestamp: any): string => {
    if (!timestamp) return '';
    let date: Date;
    if (timestamp instanceof Timestamp) {
      date = timestamp.toDate();
    } else if (typeof timestamp === 'object' && timestamp.seconds !== undefined) {
      date = new Timestamp(timestamp.seconds, timestamp.nanoseconds).toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      date = new Date(timestamp);
    }
    const hrs = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${hrs}:${mins}`;
  };

  // Find user who performed the last action on this item
  const getLastRecordedBy = (itemId: string, storeId: string) => {
    const itemTxs = transactions.filter(t => t.itemId === itemId && t.storeId === storeId);
    if (itemTxs.length > 0) {
      const latest = itemTxs.reduce((prev, current) => {
        const prevTime = prev.createdAt instanceof Timestamp ? prev.createdAt.toDate().getTime() : new Date(prev.createdAt as any).getTime();
        const currTime = current.createdAt instanceof Timestamp ? current.createdAt.toDate().getTime() : new Date(current.createdAt as any).getTime();
        return currTime > prevTime ? current : prev;
      });
      return latest.performedByName;
    }
    return 'simon wairimu';
  };

  // ====================================================
  // FILTERING LOGIC
  // ====================================================
  
  // 1. Valuation & Stock Items Filtering
  const filteredInventory = inventory.filter(item => {
    if (categoryFilter !== 'all' && item.categoryId !== categoryFilter) return false;
    if (departmentFilter !== 'all' && item.departmentId !== departmentFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.itemName.toLowerCase().includes(q);
      if (!matchName) return false;
    }
    return true;
  });

  // 2. Transactions (Ledger) Filtering
  const filteredTransactions = transactions.filter(tx => {
    if (storeFilter !== 'all' && tx.storeId !== storeFilter) return false;
    
    const catalogInfo = getCatalogInfo(tx.itemId);
    if (categoryFilter !== 'all' && catalogInfo?.categoryId !== categoryFilter) return false;
    if (departmentFilter !== 'all' && tx.departmentId !== departmentFilter) return false;
    
    const txDate = tx.createdAt?.toDate();
    if (txDate) {
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (txDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (txDate > end) return false;
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = tx.itemName.toLowerCase().includes(q);
      if (!matchName) return false;
    }

    return true;
  });

  // 3. Requisitions Filtering
  const filteredRequisitions = requisitions.filter(req => {
    if (storeFilter !== 'all' && req.fromStoreId !== storeFilter && req.toStoreId !== storeFilter) return false;
    
    const reqDate = req.createdAt?.toDate();
    if (reqDate) {
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (reqDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (reqDate > end) return false;
      }
    }
    return true;
  });

  // ====================================================
  // METRICS & BREAKDOWNS
  // ====================================================
  
  const totalValue = filteredInventory.reduce((sum, item) => sum + (item.quantity * (item.currentWeightedAverageCost ?? item.costPrice ?? 0)), 0);
  const damageCost = filteredTransactions.filter(tx => tx.reason === 'damage')
    .reduce((sum, tx) => {
      const invItem = inventory.find(i => i.itemId === tx.itemId && i.storeId === tx.storeId);
      const cost = invItem ? (invItem.currentWeightedAverageCost ?? invItem.costPrice ?? 0) : 0;
      return sum + (tx.quantity * cost);
    }, 0);

  // Consumption (Issues) per Department
  const departmentConsumption = departments.map(dept => {
    const consumptionTxs = filteredTransactions.filter(tx => {
      return tx.reason === 'issue' && tx.departmentId === dept.id;
    });

    const qty = consumptionTxs.reduce((sum, tx) => sum + tx.quantity, 0);
    const value = consumptionTxs.reduce((sum, tx) => {
      const invItem = inventory.find(i => i.itemId === tx.itemId && i.storeId === tx.storeId);
      const cost = invItem ? (invItem.currentWeightedAverageCost ?? invItem.costPrice ?? 0) : 0;
      return sum + (tx.quantity * cost);
    }, 0);

    return {
      name: dept.name,
      id: dept.id,
      quantity: qty,
      value: value
    };
  }).sort((a, b) => b.value - a.value);

  // Computed Totals for Inventory Report
  const inventoryTotals = {
    openingStock: filteredInventory.reduce((sum, item) => sum + (item.openingStock || 0), 0),
    received: filteredInventory.reduce((sum, item) => sum + (item.received || 0), 0),
    issued: filteredInventory.reduce((sum, item) => sum + (item.issued || 0), 0),
    damaged: filteredInventory.reduce((sum, item) => sum + (item.damaged || 0), 0),
    transferIn: filteredInventory.reduce((sum, item) => sum + (item.transferIn || 0), 0),
    transferOut: filteredInventory.reduce((sum, item) => sum + (item.transferOut || 0), 0),
    quantity: filteredInventory.reduce((sum, item) => sum + item.quantity, 0),
    valuation: totalValue
  };

  // Mappers for CSV/Excel output
  const mapInventoryData = (dataList: InventoryItem[]) => {
    return dataList.map(item => {
      const catName = categories.find(c => c.id === item.categoryId)?.name || 'General';
      const deptName = departments.find(d => d.id === item.departmentId)?.name || 'General';
      const storeName = getStoreName(item.storeId);
      const dateVal = item.updatedAt || item.createdAt;
      
      return {
        'Date': formatReportDate(dateVal),
        'Day': getDayName(dateVal),
        'Time': formatReportTime(dateVal),
        'Store': storeName,
        'Item Name': item.itemName,
        'Category': catName,
        'Department': deptName,
        'Unit': getUnitAbbreviation(item.unitId),
        'Opening Stock': item.openingStock || 0,
        'Qty Received': item.received || 0,
        'Qty Issued': item.issued || 0,
        'Qty Damaged': item.damaged || 0,
        'Qty Transferred In': item.transferIn || 0,
        'Qty Transferred Out': item.transferOut || 0,
        'Remaining Stock': item.quantity,
        'Weighted Average Cost': item.currentWeightedAverageCost ?? item.costPrice ?? 0,
        'Last Purchase Cost': item.lastPurchaseCost ?? 0,
        'Inventory Value': item.inventoryValue ?? (item.quantity * (item.currentWeightedAverageCost ?? item.costPrice ?? 0)),
        'Minimum Stock': item.minimumStock ?? item.minStockLevel ?? 0,
        'Recorded By': getLastRecordedBy(item.itemId, item.storeId)
      };
    });
  };

  const mapMovementData = (dataList: Transaction[]) => {
    return dataList.map(tx => {
      return {
        'Date': formatReportDate(tx.createdAt),
        'Day': getDayName(tx.createdAt),
        'Time': formatReportTime(tx.createdAt),
        'Store': getStoreName(tx.storeId),
        'Item Name': tx.itemName,
        'Type': tx.type,
        'Reason': tx.reason.replace('_', ' '),
        'Quantity': tx.quantity,
        'Notes': tx.notes || '',
        'Recorded By': tx.performedByName
      };
    });
  };

  const mapLowStockData = (dataList: InventoryItem[]) => {
    return dataList.filter(item => item.quantity <= item.minStockLevel).map(item => {
      const catName = categories.find(c => c.id === item.categoryId)?.name || 'General';
      const dateVal = item.updatedAt || item.createdAt;
      
      const wac = item.currentWeightedAverageCost ?? item.costPrice ?? 0;
      const remaining = item.quantity;
      const shortage = Math.max(0, item.minStockLevel - remaining);
      const reorderCost = shortage * wac;
      
      return {
        'Date': formatReportDate(dateVal),
        'Day': getDayName(dateVal),
        'Time': formatReportTime(dateVal),
        'Store': getStoreName(item.storeId),
        'Item Name': item.itemName,
        'Category': catName,
        'Unit': getUnitAbbreviation(item.unitId),
        'Remaining Stock': remaining,
        'Weighted Average Cost': wac,
        'Estimated Reorder Cost': reorderCost,
        'Recorded By': getLastRecordedBy(item.itemId, item.storeId)
      };
    });
  };

  const mapDamageData = (dataList: Transaction[]) => {
    return dataList.filter(tx => tx.reason === 'damage').map(tx => {
      const invItem = inventory.find(i => i.itemId === tx.itemId && i.storeId === tx.storeId);
      const itemCost = invItem ? (invItem.currentWeightedAverageCost ?? invItem.costPrice ?? 0) : 0;
      return {
        'Date': formatReportDate(tx.createdAt),
        'Day': getDayName(tx.createdAt),
        'Time': formatReportTime(tx.createdAt),
        'Store': getStoreName(tx.storeId),
        'Item Name': tx.itemName,
        'Quantity': tx.quantity,
        'Cost Price (KES)': itemCost,
        'Total Damage Cost (KES)': tx.quantity * itemCost,
        'Notes': tx.notes || '',
        'Recorded By': tx.performedByName
      };
    });
  };

  const mapRequisitionData = (dataList: Requisition[]) => {
    return dataList.map(req => {
      return {
        'Date': formatReportDate(req.createdAt),
        'Day': getDayName(req.createdAt),
        'Time': formatReportTime(req.createdAt),
        'Requesting Store': getStoreName(req.fromStoreId),
        'Supplying Store': getStoreName(req.toStoreId),
        'Items Requested': req.items.map(i => `${i.name} (${i.requestedQty})`).join(', '),
        'Status': req.status === 'fulfilled' ? 'issued' : req.status,
        'Recorded By': req.requestedByName
      };
    });
  };

  const mapDeptUsageData = () => {
    return departmentConsumption.filter(d => d.quantity > 0).map(dept => {
      const issues = filteredTransactions.filter(t => t.reason === 'issue' && t.departmentId === dept.id);
      const damages = filteredTransactions.filter(t => t.reason === 'damage' && t.departmentId === dept.id);
      
      const qtyIssued = issues.reduce((sum, t) => sum + t.quantity, 0);
      const valIssued = issues.reduce((sum, t) => {
        const invItem = inventory.find(i => i.itemId === t.itemId && i.storeId === t.storeId);
        const cost = invItem ? (invItem.currentWeightedAverageCost ?? invItem.costPrice ?? 0) : 0;
        return sum + (t.quantity * cost);
      }, 0);
      
      const qtyDamaged = damages.reduce((sum, t) => sum + t.quantity, 0);
      const valDamaged = damages.reduce((sum, t) => {
        const invItem = inventory.find(i => i.itemId === t.itemId && i.storeId === t.storeId);
        const cost = invItem ? (invItem.currentWeightedAverageCost ?? invItem.costPrice ?? 0) : 0;
        return sum + (t.quantity * cost);
      }, 0);

      return {
        'Department Name': dept.name,
        'Items Issued (Qty)': qtyIssued,
        'Total Value Issued (KES)': valIssued,
        'Items Damaged (Qty)': qtyDamaged,
        'Total Value Damaged (KES)': valDamaged,
        'Total Consumption Value (KES)': valIssued + valDamaged
      };
    });
  };

  // Excel and CSV Exporter
  const handleExport = (format: 'xlsx' | 'csv') => {
    let reportData: any[] = [];
    let reportName = '';
    let sheetName = 'Report';

    const storeNameText = storeFilter === 'all' ? 'All Stores' : getStoreName(storeFilter);

    if (activeTab === 'inventory') {
      reportName = storeFilter === 'all' ? 'Admin Multi-Store Report' : 'Inventory Report';
      reportData = mapInventoryData(filteredInventory);
      sheetName = 'Inventory';
    } else if (activeTab === 'movements') {
      reportName = 'Daily Stock Movement Report';
      reportData = mapMovementData(filteredTransactions);
      sheetName = 'Movements';
    } else if (activeTab === 'low_stock') {
      reportName = 'Low Stock Report';
      reportData = mapLowStockData(filteredInventory);
      sheetName = 'Low Stock';
    } else if (activeTab === 'damage') {
      reportName = 'Damage Report';
      reportData = mapDamageData(filteredTransactions);
      sheetName = 'Damage';
    } else if (activeTab === 'requisitions') {
      reportName = 'Requisition Report';
      reportData = mapRequisitionData(filteredRequisitions);
      sheetName = 'Requisitions';
    } else if (activeTab === 'dept_usage') {
      reportName = 'Department Consumption Report';
      reportData = mapDeptUsageData();
      sheetName = 'Department Usage';
    }

    if (reportData.length === 0) {
      showToast('No data available to export.', 'error');
      return;
    }

    const formattedPeriod = `${formatReportDate(startDate)} – ${formatReportDate(endDate)}`;
    const generatedDateStr = `${formatReportDate(new Date())}, ${formatReportTime(new Date())}`;
    const generatedByName = profile?.name || 'Unknown User';

    const filename = `${reportName.replace(/\s+/g, '_')}_${storeNameText.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`;

    if (format === 'xlsx') {
      try {
        const wb = XLSX.utils.book_new();
        const rows = [
          ['Report Name:', reportName],
          ['Store:', storeNameText],
          ['Report Period:', formattedPeriod],
          ['Generated Date:', generatedDateStr],
          ['Generated By:', generatedByName],
          [],
          Object.keys(reportData[0])
        ];

        reportData.forEach(row => {
          rows.push(Object.values(row));
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        ws['!freeze'] = { xSplit: 0, ySplit: 7 };

        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.xlsx`;
        link.click();
        showToast('Excel report downloaded.');
      } catch (err) {
        console.error(err);
        showToast('Excel export failed.', 'error');
      }
    } else {
      try {
        const csvHeaders = Object.keys(reportData[0]).join(',');
        const csvRows = reportData.map(row => 
          Object.values(row).map(val => {
            if (typeof val === 'string') {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          }).join(',')
        );

        const headerText = [
          `Report Name,${reportName}`,
          `Store,${storeNameText}`,
          `Report Period,${formattedPeriod}`,
          `Generated Date,${generatedDateStr}`,
          `Generated By,${generatedByName}`,
          ''
        ].join('\n');

        const csvContent = `${headerText}\n${csvHeaders}\n${csvRows.join('\n')}`;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.csv`;
        link.click();
        showToast('CSV report downloaded.');
      } catch (err) {
        console.error(err);
        showToast('CSV export failed.', 'error');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-500 border-t-transparent"></div>
      </div>
    );
  }

  // Pre-calculated page items
  const startIdx = (page - 1) * pageSize;
  const pageInventory = filteredInventory.slice(startIdx, startIdx + pageSize);
  const totalPages = Math.ceil(filteredInventory.length / pageSize) || 1;

  const formattedPeriodHeader = `${formatReportDate(startDate)} – ${formatReportDate(endDate)}`;
  const generatedDateStrHeader = `${formatReportDate(new Date())}, ${formatReportTime(new Date())}`;
  const generatedByNameHeader = profile?.name || 'Unknown User';

  return (
    <div className="space-y-6">
      
      {/* Title Header */}
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-gray-900 md:text-2xl">
          Reports
        </h2>
        <p className="text-xs text-gray-500 font-semibold mt-0.5">
          Download and analyze inventory data
        </p>
      </div>

      {/* ==========================================
          ADVANCED FILTER PANEL
          ========================================== */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          
          {/* Store Filter */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Store</label>
            {isAdmin() ? (
              <select
                value={storeFilter}
                onChange={(e) => { setStoreFilter(e.target.value); setPage(1); }}
                className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
              >
                <option value="all">All Stores</option>
                {stores.map(st => (
                  <option key={st.id} value={st.id}>{st.name}</option>
                ))}
              </select>
            ) : (
              <div className="w-full rounded-xl border border-gray-200 bg-gray-100 px-3 py-2.5 text-xs font-bold text-gray-600">
                {selectedStore?.name || 'Assigned Store'}
              </div>
            )}
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
            />
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Department</label>
            <select
              value={departmentFilter}
              onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
              className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
            >
              <option value="all">All Departments</option>
              {departments.map(dept => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </div>

        </div>

        {/* Metadata and Reset Row */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 pt-3 border-t border-gray-100 flex-wrap">
          <div className="flex flex-row flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500 font-semibold">
            <div><span className="text-gray-400">Period:</span> {formattedPeriodHeader}</div>
            <div><span className="text-gray-400">Generated:</span> {generatedDateStrHeader}</div>
            <div><span className="text-gray-400">By:</span> {generatedByNameHeader}</div>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
            <div className="relative max-w-xs flex-1">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="h-3.5 w-3.5 text-gray-400" />
              </span>
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="pl-9 pr-4 py-2 block w-full rounded-xl border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleResetFilters}
              className="flex items-center text-xs font-extrabold text-orange-500 hover:text-orange-600 transition-colors shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* ==========================================
          SUB-TAB NAVIGATION CAPSULE
          ========================================== */}
      <div className="flex bg-[#F1F5F9] p-1.5 rounded-2xl border border-gray-200/50 overflow-x-auto whitespace-nowrap gap-1">
        {['inventory', 'movements', 'low_stock', 'damage', 'requisitions', 'dept_usage'].map((tab) => {
          let label = '';
          if (tab === 'inventory') label = 'Inventory';
          else if (tab === 'movements') label = 'Movements';
          else if (tab === 'low_stock') label = 'Low Stock';
          else if (tab === 'damage') label = 'Damage';
          else if (tab === 'requisitions') label = 'Requisitions';
          else if (tab === 'dept_usage') label = 'Dept Usage';

          const isActive = activeTab === tab;

          return (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab as any); setPage(1); }}
              className={`flex-1 text-center py-2 px-4 rounded-xl text-xs font-extrabold transition-all duration-200 ${
                isActive 
                  ? 'bg-white text-gray-800 shadow-sm border border-gray-200/20' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/40'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ==========================================
          REPORT SHEETS PANELS
          ========================================== */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
        
        {/* Tab Title and Downloader */}
        <div className="flex justify-between items-start gap-4">
          <div>
            <h3 className="text-base font-extrabold text-gray-900 capitalize">
              {activeTab === 'inventory' && (storeFilter === 'all' ? 'Admin Multi-Store Report' : 'Inventory Report')}
              {activeTab === 'movements' && 'Daily Stock Movement Report'}
              {activeTab === 'low_stock' && 'Low Stock Report'}
              {activeTab === 'damage' && 'Damage Report'}
              {activeTab === 'requisitions' && 'Requisition Report'}
              {activeTab === 'dept_usage' && 'Department Consumption Report'}
            </h3>
            <p className="text-xs text-gray-400 font-semibold mt-1">
              {activeTab === 'inventory' && `${filteredInventory.length} items · Total value: ${formatCurrency(totalValue)}`}
              {activeTab === 'movements' && `${filteredTransactions.length} transaction entries`}
              {activeTab === 'low_stock' && `${filteredInventory.filter(i => i.quantity <= i.minStockLevel).length} warning items`}
              {activeTab === 'damage' && `${filteredTransactions.filter(t => t.reason === 'damage').length} damage incidents`}
              {activeTab === 'requisitions' && `${filteredRequisitions.length} requests`}
              {activeTab === 'dept_usage' && `${departmentConsumption.filter(d => d.quantity > 0).length} departments active`}
            </p>
          </div>

          {/* XLSX / CSV download triggers */}
          <div className="flex space-x-2 shrink-0">
            <button
              onClick={() => handleExport('xlsx')}
              className="flex items-center justify-center py-2 px-4 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-bold shadow-sm transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4 mr-1.5 text-emerald-600" />
              XLSX
            </button>
            <button
              onClick={() => handleExport('csv')}
              className="flex items-center justify-center py-2 px-4 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-bold shadow-sm transition-colors"
            >
              <FileText className="h-4 w-4 mr-1.5 text-blue-600" />
              CSV
            </button>
          </div>
        </div>

        {/* 1. Inventory Report View */}
        {activeTab === 'inventory' && (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="min-w-full divide-y divide-gray-100 text-left">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Date</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Day</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Time</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Store</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Item Name</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Category</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Unit</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-center">Opening Stock</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-center">Qty Received</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-center">Qty Issued</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-center">Qty Damaged</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-center">Trans In</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-center">Trans Out</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-center">Remaining Stock</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">Weighted Avg Cost</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">Last Purchase Cost</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">Inventory Value</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-center">Min Stock</th>
                    <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white text-xs">
                  {pageInventory.length === 0 ? (
                    <tr>
                      <td colSpan={17} className="text-center py-10 text-gray-400 font-bold">
                        No inventory items found matching filters.
                      </td>
                    </tr>
                  ) : (
                    pageInventory.map((item, index) => {
                      const dateVal = item.updatedAt || item.createdAt;
                      const rowBg = index % 2 === 0 ? 'bg-[#FDF2F8]' : 'bg-white';
                      return (
                        <tr key={item.id} className={`${rowBg} hover:bg-pink-50/30 transition-colors`}>
                          <td className="px-6 py-3 whitespace-nowrap text-gray-700 font-medium">{formatReportDate(dateVal)}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-gray-600 font-semibold">{getDayName(dateVal)}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-gray-500 font-medium">{formatReportTime(dateVal)}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-gray-700 font-bold">{getStoreName(item.storeId)}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-gray-800 font-bold capitalize">{item.itemName}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-gray-600 font-bold">{categories.find(c => c.id === item.categoryId)?.name || 'General'}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-gray-600 font-bold">{getUnitAbbreviation(item.unitId)}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-gray-700 font-bold text-center">{item.openingStock || 0}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-gray-700 font-bold text-center">{item.received || 0}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-gray-700 font-bold text-center">{item.issued || 0}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-gray-700 font-bold text-center">{item.damaged || 0}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-gray-700 font-bold text-center">{item.transferIn || 0}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-gray-700 font-bold text-center">{item.transferOut || 0}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-gray-950 font-black text-center">{item.quantity}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-gray-700 font-bold text-right">{formatCurrency(item.currentWeightedAverageCost ?? item.costPrice ?? 0)}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-gray-700 font-bold text-right">{formatCurrency(item.lastPurchaseCost ?? 0)}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-gray-950 font-black text-right">{formatCurrency(item.inventoryValue ?? (item.quantity * (item.currentWeightedAverageCost ?? item.costPrice ?? 0)))}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-gray-700 font-bold text-center">{item.minimumStock ?? item.minStockLevel ?? 0}</td>
                          <td className="px-6 py-3 whitespace-nowrap text-gray-700 font-medium text-right">{getLastRecordedBy(item.itemId, item.storeId)}</td>
                        </tr>
                      );
                    })
                  )}

                  {/* Table totals footer */}
                  {filteredInventory.length > 0 && (
                    <tr className="bg-gray-100 font-extrabold text-xs text-gray-900 border-t-2 border-gray-200">
                      <td className="px-6 py-4 whitespace-nowrap font-black" colSpan={3}>TOTALS</td>
                      <td></td>
                      <td colSpan={3}></td>
                      <td className="px-6 py-4 text-center">{inventoryTotals.openingStock}</td>
                      <td className="px-6 py-4 text-center">{inventoryTotals.received}</td>
                      <td className="px-6 py-4 text-center">{inventoryTotals.issued}</td>
                      <td className="px-6 py-4 text-center">{inventoryTotals.damaged}</td>
                      <td className="px-6 py-4 text-center">{inventoryTotals.transferIn}</td>
                      <td className="px-6 py-4 text-center">{inventoryTotals.transferOut}</td>
                      <td className="px-6 py-4 text-center font-black">{inventoryTotals.quantity}</td>
                      <td colSpan={2}></td>
                      <td className="px-6 py-4 text-right font-black text-gray-950">{formatCurrency(inventoryTotals.valuation)}</td>
                      <td></td>
                      <td></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center pt-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-xs font-bold text-gray-500">Page {page} of {totalPages}</span>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}

        {/* 2. Stock Movements Ledger View */}
        {activeTab === 'movements' && (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="min-w-full divide-y divide-gray-100 text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Date</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Day</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Time</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Store</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Item Name</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Type</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Reason</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">Quantity</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Notes</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white text-xs">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-gray-400 font-bold">
                      No stock movements found matching dates and filters.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx, index) => {
                    const rowBg = index % 2 === 0 ? 'bg-[#FDF2F8]' : 'bg-white';
                    return (
                      <tr key={tx.id} className={`${rowBg} hover:bg-pink-50/30 transition-colors`}>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-700 font-medium">{formatReportDate(tx.createdAt)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-600 font-semibold">{getDayName(tx.createdAt)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-500 font-medium">{formatReportTime(tx.createdAt)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-700 font-bold">
                          {tx.reason === 'transfer_out' && tx.toStoreId ? (
                            <span>{getStoreName(tx.storeId)} → {getStoreName(tx.toStoreId)}</span>
                          ) : tx.reason === 'transfer_in' && tx.fromStoreId ? (
                            <span>{getStoreName(tx.fromStoreId)} → {getStoreName(tx.storeId)}</span>
                          ) : (
                            getStoreName(tx.storeId)
                          )}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-800 font-bold capitalize">{tx.itemName}</td>
                        <td className="px-6 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-black ${
                            tx.type === 'IN' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                          }`}>
                            {tx.type}
                          </span>
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap capitalize font-semibold text-gray-600">
                          {tx.reason === 'transfer_out' ? 'Issued (Transfer)' : 
                           tx.reason === 'transfer_in' ? 'Received (Transfer)' : 
                           tx.reason.replace('_', ' ')}
                        </td>
                        <td className={`px-6 py-3 whitespace-nowrap font-black text-right ${
                          tx.type === 'IN' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {tx.type === 'IN' ? '+' : '-'}{tx.quantity}
                        </td>
                        <td className="px-6 py-3 text-gray-500 italic max-w-xs truncate">{tx.notes || '-'}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-right text-gray-700 font-medium">{tx.performedByName}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 3. Low Stock View */}
        {activeTab === 'low_stock' && (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="min-w-full divide-y divide-gray-100 text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Date</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Day</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Time</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Store</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Item Name</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Category</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Unit</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-center">Remaining Stock</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-center">Min Level</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">Weighted Avg Cost</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">Estimated Reorder Cost</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white text-xs">
                {filteredInventory.filter(item => item.quantity <= item.minStockLevel).length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center py-10 text-gray-400 font-bold">
                      No low stock alerts for the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredInventory.filter(item => item.quantity <= item.minStockLevel).map((item, index) => {
                    const dateVal = item.updatedAt || item.createdAt;
                    const rowBg = index % 2 === 0 ? 'bg-[#FDF2F8]' : 'bg-white';
                    return (
                      <tr key={item.id} className={`${rowBg} hover:bg-pink-50/30 transition-colors`}>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-700 font-medium">{formatReportDate(dateVal)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-600 font-semibold">{getDayName(dateVal)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-500 font-medium">{formatReportTime(dateVal)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-700 font-bold">{getStoreName(item.storeId)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-red-600 font-bold capitalize flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {item.itemName}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-600 font-bold">{categories.find(c => c.id === item.categoryId)?.name || 'General'}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-600 font-bold">{getUnitAbbreviation(item.unitId)}</td>
                        <td className="px-6 py-3 whitespace-nowrap font-black text-center text-red-600">{item.quantity}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-500 font-bold text-center">{item.minStockLevel}</td>
                        <td className="px-6 py-3 whitespace-nowrap font-bold text-gray-600 text-right">{formatCurrency(item.currentWeightedAverageCost ?? item.costPrice ?? 0)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-right font-black text-gray-950">
                          {formatCurrency(Math.max(0, item.minStockLevel - item.quantity) * (item.currentWeightedAverageCost ?? item.costPrice ?? 0))}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-right text-gray-700 font-medium">{getLastRecordedBy(item.itemId, item.storeId)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. Damage Report View */}
        {activeTab === 'damage' && (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="min-w-full divide-y divide-gray-100 text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Date</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Day</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Time</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Store</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Item Name</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-center">Quantity</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Cost Price</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">Total Loss (KES)</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Notes</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white text-xs">
                {filteredTransactions.filter(tx => tx.reason === 'damage').length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-gray-400 font-bold">
                      No damaged items found matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.filter(tx => tx.reason === 'damage').map((tx, index) => {
                    const itemCost = inventory.find(i => i.itemId === tx.itemId && i.storeId === tx.storeId)?.costPrice || 0;
                    const rowBg = index % 2 === 0 ? 'bg-[#FDF2F8]' : 'bg-white';
                    return (
                      <tr key={tx.id} className={`${rowBg} hover:bg-pink-50/30 transition-colors`}>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-700 font-medium">{formatReportDate(tx.createdAt)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-600 font-semibold">{getDayName(tx.createdAt)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-500 font-medium">{formatReportTime(tx.createdAt)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-700 font-bold">{getStoreName(tx.storeId)}</td>
                        <td className="px-6 py-3 whitespace-nowrap font-bold capitalize text-red-600">{tx.itemName}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-center font-black text-red-600">{tx.quantity}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-600 font-bold">{formatCurrency(itemCost)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-right font-black text-red-700">{formatCurrency(tx.quantity * itemCost)}</td>
                        <td className="px-6 py-3 text-gray-500 italic max-w-xs truncate">{tx.notes || '-'}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-right text-gray-700 font-medium">{tx.performedByName}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. Requisition Report View */}
        {activeTab === 'requisitions' && (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="min-w-full divide-y divide-gray-100 text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Date</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Day</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Time</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Requesting Store</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Supplying Store</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Items Requested</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Status</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white text-xs">
                {filteredRequisitions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-gray-400 font-bold">
                      No requisitions found matching filters.
                    </td>
                  </tr>
                ) : (
                  filteredRequisitions.map((req, index) => {
                    const rowBg = index % 2 === 0 ? 'bg-[#FDF2F8]' : 'bg-white';
                    return (
                      <tr key={req.id} className={`${rowBg} hover:bg-pink-50/30 transition-colors`}>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-500 font-medium">{formatReportDate(req.createdAt)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-600 font-semibold">{getDayName(req.createdAt)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-gray-500 font-medium">{formatReportTime(req.createdAt)}</td>
                        <td className="px-6 py-3 whitespace-nowrap font-bold text-gray-800">{getStoreName(req.fromStoreId)}</td>
                        <td className="px-6 py-3 whitespace-nowrap font-bold text-gray-800">{getStoreName(req.toStoreId)}</td>
                        <td className="px-6 py-3 text-gray-600 font-semibold max-w-xs truncate">
                          {req.items.map(i => `${i.name} (${i.requestedQty})`).join(', ')}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                            req.status === 'fulfilled' ? 'bg-green-50 text-green-700 border-green-200' :
                            req.status === 'pending' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                            'bg-red-50 text-red-700 border-red-200'
                          }`}>
                            {req.status === 'fulfilled' ? 'issued' : req.status}
                          </span>
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-right text-gray-700 font-medium">{req.requestedByName}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 6. Department Consumption View */}
        {activeTab === 'dept_usage' && (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="min-w-full divide-y divide-gray-100 text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Department Name</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-center">Items Issued (Qty)</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Total Value Issued</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-center">Items Damaged (Qty)</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider">Total Value Damaged</th>
                  <th className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 tracking-wider text-right">Total Consumption Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white text-xs">
                {departmentConsumption.filter(d => d.quantity > 0).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-gray-400 font-bold">
                      No department consumption records matching filters.
                    </td>
                  </tr>
                ) : (
                  departmentConsumption.filter(d => d.quantity > 0).map((dept, index) => {
                    const issues = filteredTransactions.filter(t => t.reason === 'issue' && t.departmentId === dept.id);
                    const damages = filteredTransactions.filter(t => t.reason === 'damage' && t.departmentId === dept.id);
                    
                    const qtyIssued = issues.reduce((sum, t) => sum + t.quantity, 0);
                    const valIssued = issues.reduce((sum, t) => {
                      const invItem = inventory.find(i => i.itemId === t.itemId && i.storeId === t.storeId);
                      const cost = invItem ? (invItem.currentWeightedAverageCost ?? invItem.costPrice ?? 0) : 0;
                      return sum + (t.quantity * cost);
                    }, 0);
                    
                    const qtyDamaged = damages.reduce((sum, t) => sum + t.quantity, 0);
                    const valDamaged = damages.reduce((sum, t) => {
                      const invItem = inventory.find(i => i.itemId === t.itemId && i.storeId === t.storeId);
                      const cost = invItem ? (invItem.currentWeightedAverageCost ?? invItem.costPrice ?? 0) : 0;
                      return sum + (t.quantity * cost);
                    }, 0);

                    const rowBg = index % 2 === 0 ? 'bg-[#FDF2F8]' : 'bg-white';

                    return (
                      <tr key={dept.id} className={`${rowBg} hover:bg-pink-50/30 transition-colors`}>
                        <td className="px-6 py-3 whitespace-nowrap font-bold text-gray-900">{dept.name}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-center font-bold text-gray-700">{qtyIssued}</td>
                        <td className="px-6 py-3 whitespace-nowrap font-bold text-gray-600">{formatCurrency(valIssued)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-center font-bold text-gray-700">{qtyDamaged}</td>
                        <td className="px-6 py-3 whitespace-nowrap font-bold text-gray-600">{formatCurrency(valDamaged)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-right font-black text-gray-950">{formatCurrency(valIssued + valDamaged)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
};
