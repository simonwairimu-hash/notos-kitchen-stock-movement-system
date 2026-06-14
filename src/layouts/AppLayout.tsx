import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { 
  LayoutDashboard, 
  Package, 
  ArrowUpDown, 
  ClipboardList, 
  BarChart3, 
  Store, 
  Users, 
  Tags, 
  Layers, 
  Scale, 
  History, 
  LogOut, 
  Menu, 
  X,
  ChevronDown,
  User as UserIcon,
  Plus,
  Upload
} from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { profile, logout, isAdmin } = useAuth();
  const { stores, selectedStoreId, setSelectedStoreId, selectedStore } = useStore();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigationItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['admin', 'store_user'] },
    { name: 'Inventory', path: '/inventory', icon: Package, roles: ['admin', 'store_user'] },
    { name: 'Stock Movements', path: '/movements', icon: ArrowUpDown, roles: ['admin', 'store_user'] },
    { name: 'Requisitions', path: '/requisitions', icon: ClipboardList, roles: ['admin', 'store_user'] },
    { name: 'Categories', path: '/admin/categories', icon: Tags, roles: ['admin', 'store_user'] },
    { name: 'Departments', path: '/admin/departments', icon: Layers, roles: ['admin', 'store_user'] },
    { name: 'Units', path: '/admin/units', icon: Scale, roles: ['admin', 'store_user'] },
    { name: 'Reports', path: '/reports', icon: BarChart3, roles: ['admin', 'store_user'] },
    { name: 'Bulk Import', path: '/import', icon: Upload, roles: ['admin', 'store_user'] },
  ];

  const adminItems = [
    { name: 'Stores', path: '/admin/stores', icon: Store },
    { name: 'Users', path: '/admin/users', icon: Users },
    { name: 'Audit Log', path: '/admin/audit', icon: History },
  ];

  const filteredNavItems = navigationItems.filter(item => 
    profile && item.roles.includes(profile.role)
  );

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50 text-gray-900">
      
      {/* ==========================================
          DESKTOP SIDEBAR
          ========================================== */}
      <aside className="hidden w-64 shrink-0 flex-col bg-[#0f172a] text-slate-300 md:flex">
        {/* Brand Logo Header */}
        <div className="flex h-16 items-center px-6 border-b border-slate-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-white shadow-lg shadow-orange-500/25">
            <Package className="h-5 w-5" />
          </div>
          <div className="ml-3">
            <h1 className="text-xs font-bold text-white leading-none">Notos Kitchen</h1>
            <span className="text-[9px] text-slate-400 font-semibold tracking-wider uppercase">Stock Movement</span>
          </div>
        </div>

        {/* Sidebar Nav Items */}
        <nav className="flex-1 space-y-1 px-4 py-6 overflow-y-auto">
          {filteredNavItems.map((item) => {
            const active = isActive(item.path);
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                  active 
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-500/10' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className={`mr-3 h-5 w-5 ${active ? 'text-white' : 'text-slate-400'}`} />
                {item.name}
              </Link>
            );
          })}

          {/* ADMIN Group */}
          {isAdmin() && (
            <div className="mt-8">
              <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Admin</p>
              <div className="space-y-1">
                {adminItems.map((item) => {
                  const active = isActive(item.path);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      to={item.path}
                      className={`flex items-center px-4 py-2 text-xs font-medium rounded-xl transition-all ${
                        active 
                          ? 'bg-orange-500/10 text-orange-400' 
                          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Icon className="mr-3 h-4 w-4 shrink-0" />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        {/* Footer Profile Badging */}
        <div className="p-4 border-t border-slate-800 bg-[#0b0f19]">
          <div className="flex items-center justify-between">
            <div className="flex items-center min-w-0">
              <div className="h-9 w-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-semibold text-white uppercase shrink-0">
                {profile?.name?.substring(0, 1) || 'U'}
              </div>
              <div className="ml-3 min-w-0">
                <p className="text-xs font-bold text-white truncate">{profile?.name || 'User'}</p>
                <p className="text-[10px] text-slate-400 font-semibold capitalize truncate">{profile?.role || 'Staff'}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-800 hover:text-red-400 transition-all shrink-0"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ==========================================
          MAIN CONTENT WRAPPER
          ========================================== */}
      <div className="flex flex-1 flex-col overflow-hidden">
        
        {/* Top Header Bar */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 md:px-8">
          <div className="flex items-center space-x-4">
            {/* Page header title & current store badge */}
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold uppercase tracking-wider bg-orange-100 text-orange-700 px-2 py-0.5 rounded-md">
                {selectedStore?.name || 'Global'}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Store Selector (Visible to Admin only) */}
            {isAdmin() && stores.length > 0 && (
              <div className="relative flex items-center bg-gray-100 rounded-xl px-3 py-1.5 hover:bg-gray-200 transition-colors">
                <Store className="h-4 w-4 mr-2 text-gray-500" />
                <select
                  value={selectedStoreId || ''}
                  onChange={(e) => setSelectedStoreId(e.target.value || null)}
                  className="bg-transparent text-xs font-bold text-gray-700 focus:outline-none pr-4 cursor-pointer appearance-none"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-3.5 w-3.5 absolute right-2 text-gray-500 pointer-events-none" />
              </div>
            )}

            {!isAdmin() && (
              <div className="flex items-center space-x-2 text-xs font-semibold text-gray-500">
                <Store className="h-4 w-4" />
                <span>{selectedStore?.location || 'Store Context'}</span>
              </div>
            )}
          </div>
        </header>

        {/* Dynamic Nested Screen Router */}
        <main className="flex-1 overflow-y-auto px-4 py-6 md:p-8 pb-24 md:pb-8">
          <Outlet />
        </main>
      </div>

      {/* ==========================================
          MOBILE BOTTOM NAVIGATION
          ========================================== */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex h-16 border-t border-gray-200 bg-white md:hidden px-2">
        {filteredNavItems.slice(0, 4).map((item) => {
          const active = isActive(item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              to={item.path}
              className={`flex flex-1 flex-col items-center justify-center py-1 text-[10px] font-semibold transition-all ${
                active ? 'text-orange-500' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon className="h-5 w-5 mb-0.5" />
              <span>{item.name}</span>
            </Link>
          );
        })}

        {/* "More/Menu" trigger on mobile for remaining pages */}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-1 flex-col items-center justify-center py-1 text-[10px] font-semibold text-gray-400 hover:text-gray-600"
        >
          <Menu className="h-5 w-5 mb-0.5" />
          <span>More</span>
        </button>
      </div>

      {/* ==========================================
          MOBILE MORE DRAWER (Slide Up Drawer)
          ========================================== */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm md:hidden">
          <div className="w-4/5 max-w-sm h-full bg-white flex flex-col p-6 shadow-xl animate-slide-left">
            <div className="flex justify-between items-center pb-4 border-b border-gray-100">
              <div className="flex items-center">
                <div className="h-9 w-9 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-sm font-bold uppercase">
                  {profile?.name?.substring(0, 1) || 'U'}
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-bold text-gray-900">{profile?.name}</h3>
                  <p className="text-xs text-gray-500 font-medium capitalize">{profile?.role}</p>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Navigation Options in Drawer */}
            <div className="flex-1 overflow-y-auto py-6 space-y-6">
              {/* Main operational and configuration links (excluding first 4) */}
              {profile && filteredNavItems.length > 4 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Management & Settings</p>
                  <div className="space-y-1">
                    {filteredNavItems.slice(4).map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.name}
                          to={item.path}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center px-3 py-2.5 text-sm font-semibold rounded-xl ${
                            isActive(item.path) ? 'bg-orange-50 text-orange-600' : 'text-gray-600'
                          }`}
                        >
                          <Icon className="h-5 w-5 mr-3 shrink-0" />
                          {item.name}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Admin settings pages */}
              {isAdmin() && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Settings & Admin</p>
                  <div className="space-y-1">
                    {adminItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.name}
                          to={item.path}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center px-3 py-2 text-sm font-semibold rounded-xl ${
                            isActive(item.path) ? 'bg-orange-50 text-orange-600' : 'text-gray-600'
                          }`}
                        >
                          <Icon className="h-4 w-4 mr-3 shrink-0" />
                          {item.name}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Logout Action in Mobile Drawer */}
            <div className="pt-4 border-t border-gray-100">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="flex w-full items-center justify-center space-x-2 py-3 border border-red-200 hover:bg-red-50 text-red-600 rounded-xl text-sm font-semibold transition-all"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
