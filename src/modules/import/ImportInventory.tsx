import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { registerItemAndAddToInventory, subscribeToCategories, subscribeToDepartments, subscribeToUnits, subscribeToInventory } from '../../services/dbService';
import { Category, Department, Unit, InventoryItem } from '../../types/models';
import { useToast } from '../../context/ToastContext';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, HelpCircle, Store } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ParsedRow {
  rowNumber: number;
  itemName: string;
  categoryName: string;
  departmentName: string;
  unitName: string;
  costPrice: number;
  openingStock: number;
  minStock: number;
  status: 'valid' | 'invalid';
  errorDetail?: string;
}

export const ImportInventory: React.FC = () => {
  const { profile, isAdmin } = useAuth();
  const { stores, selectedStoreId, selectedStore } = useStore();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [existingInventory, setExistingInventory] = useState<InventoryItem[]>([]);
  
  const [targetStoreId, setTargetStoreId] = useState<string>('');
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importSummary, setImportSummary] = useState<{ imported: number; failed: number } | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [fileSelected, setFileSelected] = useState<File | null>(null);

  // Subscribe to metadata config
  useEffect(() => {
    if (!targetStoreId) return;
    setLoadingConfig(true);
    const unsubCat = subscribeToCategories(targetStoreId, setCategories);
    const unsubDept = subscribeToDepartments(targetStoreId, setDepartments);
    const unsubUnit = subscribeToUnits(targetStoreId, (list) => {
      setUnits(list);
      setLoadingConfig(false);
    });

    return () => {
      unsubCat();
      unsubDept();
      unsubUnit();
    };
  }, [targetStoreId]);

  // Sync targetStoreId with active selection
  useEffect(() => {
    if (isAdmin()) {
      setTargetStoreId(selectedStoreId || (stores[0]?.id || ''));
    } else if (profile?.assignedStoreId) {
      setTargetStoreId(profile.assignedStoreId);
    }
  }, [selectedStoreId, profile, stores, isAdmin]);

  // Subscribe to existing inventory for the target store to avoid duplicates
  useEffect(() => {
    if (!targetStoreId) return;
    const unsubInv = subscribeToInventory(targetStoreId, setExistingInventory);
    return () => unsubInv();
  }, [targetStoreId]);

  // Download a sample template file
  const handleDownloadTemplate = () => {
    const headers = [
      ['Item Name', 'Category', 'Department', 'Unit', 'Cost Price', 'Opening Stock', 'Min Stock Threshold'],
      ['Premium Basmati Rice', 'Dry Goods', 'Main Kitchen', 'kg', '150', '20', '5'],
      ['Fresh Whole Milk', 'Dairy', 'APA', 'L', '80', '10', '3'],
      ['Stainless Steel Spoons', 'Cutlery', 'Cutlery Movement', 'pc', '45', '100', '10']
    ];

    const ws = XLSX.utils.aoa_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory Template');
    XLSX.writeFile(wb, 'Notos_Inventory_Import_Template.xlsx');
    showToast('Template downloaded successfully.');
  };

  // Parsing Excel/CSV file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setFileSelected(file);
    setParsing(true);
    setValidationErrors([]);
    setParsedRows([]);
    setImportSummary(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to array of arrays to preserve column order and raw parsing
        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (rawRows.length < 2) {
          throw new Error('The uploaded file is empty or missing data rows.');
        }

        const headers = rawRows[0].map((h: any) => String(h || '').trim().toLowerCase());
        
        // Required columns validation
        const requiredHeaders = ['item name', 'category', 'department', 'unit', 'cost price', 'opening stock'];
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
        
        if (missingHeaders.length > 0) {
          throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
        }

        // Map header indices
        const idxName = headers.indexOf('item name');
        const idxCat = headers.indexOf('category');
        const idxDept = headers.indexOf('department');
        const idxUnit = headers.indexOf('unit');
        const idxCost = headers.indexOf('cost price');
        const idxOpening = headers.indexOf('opening stock');
        const idxMin = headers.indexOf('min stock threshold'); // optional column

        const tempRows: ParsedRow[] = [];
        
        // Create lookup maps for configurations
        const categoryMap = new Map(categories.map(c => [c.name.toLowerCase().trim(), c]));
        const departmentMap = new Map(departments.map(d => [d.name.toLowerCase().trim(), d]));
        const unitMap = new Map(units.map(u => [u.abbreviation.toLowerCase().trim(), u]));
        const unitNameMap = new Map(units.map(u => [u.name.toLowerCase().trim(), u]));

        const existingNames = new Set(existingInventory.map(item => item.itemName.toUpperCase().trim()));

        for (let i = 1; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (!row || row.length === 0 || row.every((c: any) => c === undefined || c === null || String(c).trim() === '')) {
            continue; // Skip empty rows
          }

          const rowNum = i + 1;
          const itemName = String(row[idxName] || '').trim();
          const categoryName = String(row[idxCat] || '').trim();
          const departmentName = String(row[idxDept] || '').trim();
          const unitName = String(row[idxUnit] || '').trim();
          const costPriceRaw = row[idxCost];
          const openingStockRaw = row[idxOpening];
          const minStockRaw = idxMin !== -1 ? row[idxMin] : 5;

          const errors: string[] = [];

          // Validation
          if (!itemName) errors.push('Item Name is required');
          else if (existingNames.has(itemName.toUpperCase())) errors.push(`Item name "${itemName}" already registered in this store`);

          const catObj = categoryMap.get(categoryName.toLowerCase());
          if (!categoryName) errors.push('Category is required');
          else if (!catObj) errors.push(`Category "${categoryName}" does not exist`);

          const deptObj = departmentMap.get(departmentName.toLowerCase());
          if (!departmentName) errors.push('Department is required');
          else if (!deptObj) errors.push(`Department "${departmentName}" does not exist`);

          const unitObj = unitMap.get(unitName.toLowerCase()) || unitNameMap.get(unitName.toLowerCase());
          if (!unitName) errors.push('Unit is required');
          else if (!unitObj) errors.push(`Unit abbreviation/name "${unitName}" does not exist`);

          const costPrice = Number(costPriceRaw);
          if (costPriceRaw === undefined || costPriceRaw === null || isNaN(costPrice) || costPrice < 0) {
            errors.push('Cost Price must be a positive number or zero');
          }

          const openingStock = Number(openingStockRaw);
          if (openingStockRaw === undefined || openingStockRaw === null || isNaN(openingStock) || openingStock < 0) {
            errors.push('Opening Stock must be a positive number or zero');
          }

          const minStock = Number(minStockRaw);
          if (isNaN(minStock) || minStock < 0) {
            errors.push('Min Stock Threshold must be a positive number or zero');
          }

          tempRows.push({
            rowNumber: rowNum,
            itemName,
            categoryName: catObj?.name || categoryName,
            departmentName: deptObj?.name || departmentName,
            unitName: unitObj?.abbreviation || unitName,
            costPrice: isNaN(costPrice) ? 0 : costPrice,
            openingStock: isNaN(openingStock) ? 0 : openingStock,
            minStock: isNaN(minStock) ? 5 : minStock,
            status: errors.length === 0 ? 'valid' : 'invalid',
            errorDetail: errors.join(', ')
          });
        }

        setParsedRows(tempRows);
        showToast(`Parsed ${tempRows.length} rows from file.`);
      } catch (err: any) {
        console.error(err);
        setValidationErrors([err.message || 'Failed to parse file. Ensure it is a valid Excel or CSV file.']);
        showToast(err.message || 'File parsing error.', 'error');
      } finally {
        setParsing(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Save the validated parsed items to Firestore
  const handleSaveImport = async () => {
    if (parsedRows.length === 0 || !targetStoreId) return;
    
    const validRows = parsedRows.filter(r => r.status === 'valid');
    if (validRows.length === 0) {
      showToast('No valid rows to import. Correct validation errors and try again.', 'error');
      return;
    }

    setSaving(true);
    let importedCount = 0;
    let failedCount = 0;
    const tempRows = [...parsedRows];

    const categoryMap = new Map(categories.map(c => [c.name.toLowerCase().trim(), c.id]));
    const departmentMap = new Map(departments.map(d => [d.name.toLowerCase().trim(), d.id]));
    const unitMap = new Map(units.map(u => [u.abbreviation.toLowerCase().trim(), u.id]));
    
    try {
      for (const row of tempRows) {
        if (row.status !== 'valid') {
          failedCount++;
          continue;
        }

        try {
          const categoryId = categoryMap.get(row.categoryName.toLowerCase())!;
          const departmentId = departmentMap.get(row.departmentName.toLowerCase())!;
          const unitId = unitMap.get(row.unitName.toLowerCase())!;

          await registerItemAndAddToInventory({
            storeId: targetStoreId,
            name: row.itemName,
            categoryId,
            departmentId,
            unitId,
            quantity: row.openingStock,
            minStockLevel: row.minStock,
            costPrice: row.costPrice
          }, {
            userId: profile!.uid,
            userName: profile!.name,
            userEmail: profile!.email
          });

          importedCount++;
        } catch (err: any) {
          console.error(`Import failed for row ${row.rowNumber}:`, err);
          row.status = 'invalid';
          row.errorDetail = err.message || 'Database registration failed';
          failedCount++;
        }
      }

      setParsedRows(tempRows);
      setImportSummary({ imported: importedCount, failed: failedCount });
      showToast(`Import completed. Successful: ${importedCount}, Failed: ${failedCount}`);
    } catch (err: any) {
      showToast('An error occurred during import transaction.', 'error');
    } finally {
      setSaving(false);
      setFileSelected(null);
    }
  };

  const validCount = parsedRows.filter(r => r.status === 'valid').length;
  const invalidCount = parsedRows.filter(r => r.status === 'invalid').length;

  if (stores.length === 0) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm text-center max-w-lg mx-auto mt-10">
        <Store className="h-12 w-12 text-orange-500 mx-auto mb-4 animate-pulse shrink-0" />
        <h3 className="text-base font-extrabold text-gray-950">No Store Outlets Configured</h3>
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
          You must create at least one store outlet in the **Store Directory** before you can import bulk inventory items.
        </p>
        {isAdmin() && (
          <div className="mt-6">
            <button
              onClick={() => navigate('/admin/stores')}
              className="inline-flex items-center justify-center py-2.5 px-5 rounded-xl text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 transition-colors shadow-md shadow-orange-500/10"
            >
              Go to Store Directory
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Title Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-gray-900 md:text-2xl">
            Bulk Import Inventory
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Bulk upload items, cost rates, and opening stock balances into your target store.
          </p>
        </div>

        <button
          onClick={handleDownloadTemplate}
          className="flex items-center justify-center py-2.5 px-4 rounded-xl text-xs font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm shrink-0"
        >
          <FileSpreadsheet className="h-4 w-4 mr-1.5 text-emerald-600" />
          Download Template
        </button>
      </div>

      {/* Configuration Loading spinner */}
      {loadingConfig ? (
        <div className="flex h-[20vh] items-center justify-center bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-orange-500 border-t-transparent"></div>
          <span className="ml-3 text-xs font-semibold text-gray-500">Loading catalog parameters...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* File Upload Panel */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
              
              {/* Store Selector (Admin only) */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center">
                  <Store className="h-3.5 w-3.5 mr-1" />
                  Target Store Outlet Scoping
                </label>
                {isAdmin() ? (
                  <select
                    value={targetStoreId}
                    onChange={(e) => setTargetStoreId(e.target.value)}
                    className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none"
                  >
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

              {/* Drag and Drop zone */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Upload Excel or CSV File</label>
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-gray-200 border-dashed rounded-2xl cursor-pointer bg-gray-50 hover:bg-gray-100 hover:border-orange-300 transition-all">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                      <Upload className="w-8 h-8 mb-2 text-gray-400" />
                      <p className="text-xs font-bold text-gray-600">Click to upload spreadsheet</p>
                      <p className="text-[10px] text-gray-400 mt-1">Supports .xlsx, .xls, .csv</p>
                    </div>
                    <input 
                      type="file" 
                      className="hidden" 
                      accept=".xlsx,.xls,.csv" 
                      onChange={handleFileChange}
                      onClick={(e) => { (e.target as any).value = null; }} // reset file selection trigger
                    />
                  </label>
                </div>
              </div>

              {fileSelected && (
                <div className="p-3 bg-orange-50/50 border border-orange-100 rounded-xl flex items-center justify-between text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800 truncate">{fileSelected.name}</p>
                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">Size: {(fileSelected.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2">
                <button
                  onClick={handleSaveImport}
                  disabled={saving || parsing || parsedRows.length === 0 || validCount === 0}
                  className="w-full flex justify-center py-3 px-4 rounded-xl text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 focus:outline-none disabled:opacity-50 transition-colors shadow-md shadow-orange-500/10"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Importing Records...
                    </>
                  ) : (
                    `Save Import (${validCount} Valid Items)`
                  )}
                </button>
              </div>

            </div>

            {/* Parsing status / instructions card */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm text-xs space-y-2 text-gray-500 font-medium">
              <h4 className="font-bold text-gray-800 flex items-center mb-1">
                <HelpCircle className="h-4 w-4 mr-1 text-orange-500" />
                Data Validation Requirements
              </h4>
              <p>1. Item Name and SKU must be unique in this store.</p>
              <p>2. Categories, Departments, and Units abbreviations must match existing catalog settings exactly.</p>
              <p>3. Cost Price and Opening Stock must be non-negative numeric digits.</p>
            </div>
          </div>

          {/* Verification / Preview Area */}
          <div className="lg:col-span-2 space-y-4">
            
            {/* Validation errors alerts */}
            {validationErrors.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div className="text-xs text-red-700 font-medium">
                  <h4 className="font-bold mb-1">File Header Processing Error</h4>
                  {validationErrors.map((err, i) => <p key={i}>{err}</p>)}
                </div>
              </div>
            )}

            {/* Parsing status loader */}
            {parsing && (
              <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm flex flex-col items-center justify-center space-y-3 h-[300px]">
                <RefreshCw className="h-8 w-8 text-orange-500 animate-spin" />
                <p className="text-xs font-bold text-gray-600">Analyzing spreadsheet data and validating headers...</p>
              </div>
            )}

            {/* Summary display if uploaded successfully */}
            {importSummary && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <h4 className="text-sm font-extrabold text-gray-900">Import Complete</h4>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Imported successfully</p>
                    <h3 className="text-3xl font-black text-emerald-800 mt-1">{importSummary.imported} items</h3>
                  </div>
                  <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Failed / Rejected</p>
                    <h3 className="text-3xl font-black text-red-800 mt-1">{importSummary.failed} items</h3>
                  </div>
                </div>
              </div>
            )}

            {/* Preview list */}
            {parsedRows.length > 0 && !parsing && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[500px]">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-widest text-gray-900">Spreadsheet Row Preview & Validity</h4>
                    <p className="text-[10px] text-gray-400 font-semibold mt-0.5">Parsed {parsedRows.length} items. Valid: {validCount} / Errors: {invalidCount}</p>
                  </div>
                </div>

                <div className="flex-1 overflow-auto min-h-0 text-xs">
                  <table className="min-w-full divide-y divide-gray-100 text-left">
                    <thead className="bg-gray-50/70 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-2.5 font-bold text-gray-400">Row</th>
                        <th className="px-4 py-2.5 font-bold text-gray-400">Item</th>
                        <th className="px-4 py-2.5 font-bold text-gray-400">Opening Stock</th>
                        <th className="px-4 py-2.5 font-bold text-gray-400 text-right">Cost</th>
                        <th className="px-4 py-2.5 font-bold text-gray-400">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {parsedRows.map((row, idx) => {
                        const isValid = row.status === 'valid';
                        return (
                          <tr key={idx} className={isValid ? 'hover:bg-gray-50/20' : 'bg-red-50/10'}>
                            <td className="px-4 py-3 font-semibold text-gray-400">{row.rowNumber}</td>
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-extrabold text-gray-900">{row.itemName}</p>
                                <p className="text-[9px] text-gray-400 font-semibold uppercase">{row.categoryName} • {row.departmentName}</p>
                              </div>
                            </td>
                             <td className="px-4 py-3 font-black text-gray-800">{row.openingStock} {row.unitName}</td>
                            <td className="px-4 py-3 font-extrabold text-gray-700 text-right">{row.costPrice}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {isValid ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase">
                                  Valid
                                </span>
                              ) : (
                                <div>
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-red-50 text-red-700 border border-red-100 uppercase mb-1">
                                    Error
                                  </span>
                                  <p className="text-[9px] font-medium text-red-500 max-w-[150px] whitespace-normal">{row.errorDetail}</p>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>

        </div>
      )}

    </div>
  );
};
