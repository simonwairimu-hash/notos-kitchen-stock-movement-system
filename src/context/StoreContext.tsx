import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { Store } from '../types/models';
import { subscribeToStores } from '../services/dbService';

interface StoreContextType {
  stores: Store[];
  selectedStoreId: string | null;
  selectedStore: Store | null;
  setSelectedStoreId: (id: string | null) => void;
  loading: boolean;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, isAdmin } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) {
      setStores([]);
      setSelectedStoreId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    // Subscribe to all stores in real time
    const unsubscribe = subscribeToStores((storesList) => {
      setStores(storesList);
      
      if (isAdmin()) {
        // For Admins: Restore last selected store or default to first available
        const savedStoreId = localStorage.getItem('admin_selected_store_id');
        if (savedStoreId && storesList.some(s => s.id === savedStoreId)) {
          setSelectedStoreId(savedStoreId);
        } else if (storesList.length > 0) {
          setSelectedStoreId(storesList[0].id);
        } else {
          setSelectedStoreId(null);
        }
      } else {
        // For staff (Managers / Storekeepers): Hardcode to assigned store
        setSelectedStoreId(profile.assignedStoreId);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  const handleSetSelectedStoreId = (id: string | null) => {
    if (isAdmin()) {
      setSelectedStoreId(id);
      if (id) {
        localStorage.setItem('admin_selected_store_id', id);
      } else {
        localStorage.removeItem('admin_selected_store_id');
      }
    }
  };

  const selectedStore = stores.find(s => s.id === selectedStoreId) || null;

  return (
    <StoreContext.Provider
      value={{
        stores,
        selectedStoreId,
        selectedStore,
        setSelectedStoreId: handleSetSelectedStoreId,
        loading
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};
