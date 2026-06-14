import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { StoreProvider } from './context/StoreContext';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { AuthLayout } from './layouts/AuthLayout';

// Module views
import { Login } from './modules/auth/Login';
import { Dashboard } from './modules/dashboard/Dashboard';
import { Inventory } from './modules/inventory/Inventory';
import { Movements } from './modules/movements/Movements';
import { Requisitions } from './modules/requisitions/Requisitions';
import { Reports } from './modules/reports/Reports';
// Admin views
import { Stores } from './modules/admin/Stores';
import { Users } from './modules/admin/Users';
import { Settings } from './modules/admin/Settings';
import { AuditLog } from './modules/admin/AuditLog';
import { ImportInventory } from './modules/import/ImportInventory';

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <StoreProvider>
            <Routes>
              
              {/* Authentication views wrapper */}
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<Login />} />
              </Route>

              {/* Secure application views wrapper */}
              <Route 
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                {/* Core operational routes */}
                <Route path="/" element={<Dashboard />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/movements" element={<Movements />} />
                <Route path="/requisitions" element={<Requisitions />} />
                <Route path="/import" element={<ImportInventory />} />
                
                {/* Manager/Admin scoped reports */}
                <Route 
                  path="/reports" 
                  element={
                    <ProtectedRoute allowedRoles={['admin', 'store_user']}>
                      <Reports />
                    </ProtectedRoute>
                  } 
                />

                {/* Administrator Console routes */}
                <Route 
                  path="/admin/stores" 
                  element={
                    <ProtectedRoute allowedRoles={['admin']}>
                      <Stores />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/admin/users" 
                  element={
                    <ProtectedRoute allowedRoles={['admin']}>
                      <Users />
                    </ProtectedRoute>
                  } 
                />
                
                {/* Configure settings templates for dropdown options */}
                <Route 
                  path="/admin/categories" 
                  element={
                    <ProtectedRoute allowedRoles={['admin', 'store_user']}>
                      <Settings />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/admin/departments" 
                  element={
                    <ProtectedRoute allowedRoles={['admin', 'store_user']}>
                      <Settings />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/admin/units" 
                  element={
                    <ProtectedRoute allowedRoles={['admin', 'store_user']}>
                      <Settings />
                    </ProtectedRoute>
                  } 
                />
                
                {/* Audit trail visualization */}
                <Route 
                  path="/admin/audit" 
                  element={
                    <ProtectedRoute allowedRoles={['admin']}>
                      <AuditLog />
                    </ProtectedRoute>
                  } 
                />

              </Route>

              {/* Wildcard redirect to safety */}
              <Route path="*" element={<Navigate to="/" replace />} />

            </Routes>
          </StoreProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
