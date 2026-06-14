import React, { useState, useEffect } from 'react';
import { initializeApp, deleteApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signOut as secondarySignOut, 
  signInWithEmailAndPassword,
  updateEmail,
  updatePassword,
  deleteUser
} from 'firebase/auth';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { subscribeToUsers, createUserProfile, updateUserProfile, deleteUserProfile } from '../../services/dbService';
import { UserProfile, UserRole } from '../../types/models';
import { 
  Users as UsersIcon, 
  Plus, 
  X, 
  UserX, 
  UserCheck, 
  ShieldAlert, 
  ShieldCheck, 
  Store,
  KeyRound,
  Edit,
  Trash2,
  Lock,
  Unlock,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Search
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';

// We import the config to spin up the secondary app
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const Users: React.FC = () => {
  const { profile: currentAdmin } = useAuth();
  const { stores } = useStore();
  const { showToast } = useToast();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form states
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('store_user');
  const [assignedStoreId, setAssignedStoreId] = useState('');

  // Edit Form States
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('store_user');
  const [editStoreId, setEditStoreId] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'suspended'>('active');

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 7;

  // Dropdown Menu State
  const [activeMenuUid, setActiveMenuUid] = useState<string | null>(null);

  // Dismiss context menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveMenuUid(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedRole, selectedStore, selectedStatus]);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToUsers((loadedUsers) => {
      setUsers(loadedUsers);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync assignedStoreId default select value based on stores
  useEffect(() => {
    if (stores.length > 0 && !assignedStoreId) {
      setAssignedStoreId(stores[0].id);
    }
  }, [stores, assignedStoreId]);

  const handleOpenEdit = (user: UserProfile) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditPassword('');
    setEditPhone(user.phone || '');
    setEditRole(user.role);
    setEditStoreId(user.assignedStoreId || '');
    setEditStatus(user.status);
    setIsEditOpen(true);
  };

  const handleUpdateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!editName.trim()) {
      showToast('Name is required.', 'error');
      return;
    }
    if (!editEmail.trim()) {
      showToast('Email is required.', 'error');
      return;
    }
    if (editRole !== 'admin' && !editStoreId) {
      showToast('Non-admin users must be assigned to a store.', 'error');
      return;
    }

    setSubmitting(true);
    let secondaryAppInstance;
    let authUpdated = true;
    let authErrorMsg = '';

    try {
      const emailChanged = editEmail.trim().toLowerCase() !== editingUser.email.toLowerCase();
      const passwordChanged = editPassword.trim().length >= 6;

      if (emailChanged || passwordChanged) {
        try {
          const currentPassword = editingUser.password || 'password123';
          
          const tempAppName = `TempRegApp_${Date.now()}`;
          secondaryAppInstance = initializeApp(firebaseConfig, tempAppName);
          const secondaryAuth = getAuth(secondaryAppInstance);

          // Sign in
          await signInWithEmailAndPassword(secondaryAuth, editingUser.email, currentPassword);
          
          // Update Email if changed
          if (emailChanged) {
            await updateEmail(secondaryAuth.currentUser!, editEmail.trim());
          }
          
          // Update Password if changed
          if (passwordChanged) {
            await updatePassword(secondaryAuth.currentUser!, editPassword.trim());
          }

          // Sign out secondary auth
          await secondarySignOut(secondaryAuth);
        } catch (authErr: any) {
          console.warn('Could not update Firebase Auth credentials (user may have changed password):', authErr);
          authUpdated = false;
          authErrorMsg = authErr.message || 'Auth credentials mismatch.';
          if (authErr.code === 'auth/email-already-in-use') {
            authErrorMsg = 'This email address is already in use.';
          } else if (authErr.code === 'auth/wrong-password' || authErr.code === 'auth/invalid-credential') {
            authErrorMsg = 'Could not authenticate user to change credentials. Please verify their stored password.';
          }
        }
      }

      // Update Firestore document.
      // If Auth credentials failed to update, we do NOT change email or password in Firestore to prevent sync issues,
      // but we STILL update name, role, assignedStoreId, status, and phone.
      const updates: Partial<UserProfile> = {
        name: editName.trim(),
        role: editRole,
        assignedStoreId: editRole === 'admin' ? null : editStoreId,
        status: editStatus,
        phone: editPhone.trim() || undefined
      };

      if (authUpdated) {
        updates.email = editEmail.trim();
        if (passwordChanged) {
          updates.password = editPassword.trim();
        }
      }

      const performer = {
        userId: currentAdmin?.uid || 'unknown_admin',
        userName: currentAdmin?.name || 'Administrator',
        userEmail: currentAdmin?.email || 'admin@notos.com'
      };

      await updateUserProfile(editingUser.uid, updates, performer);

      if (authUpdated) {
        showToast(`User ${editName} updated successfully.`);
      } else {
        showToast(`Profile updated, but Auth credentials could not be changed: ${authErrorMsg}`, 'info');
      }

      setIsEditOpen(false);
      setEditingUser(null);
      setEditPassword('');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to update user profile in database.', 'error');
    } finally {
      setSubmitting(false);
      if (secondaryAppInstance) {
        await deleteApp(secondaryAppInstance);
      }
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    if (user.uid === currentAdmin?.uid) {
      showToast('You cannot delete your own admin account!', 'error');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete user "${user.name}"? This will restrict their access permanently.`)) {
      return;
    }

    setSubmitting(true);
    let secondaryAppInstance;
    try {
      const currentPassword = user.password || 'password123';

      // Deletes the Auth account first by signing in temporarily
      try {
        const tempAppName = `TempRegApp_${Date.now()}`;
        secondaryAppInstance = initializeApp(firebaseConfig, tempAppName);
        const secondaryAuth = getAuth(secondaryAppInstance);

        await signInWithEmailAndPassword(secondaryAuth, user.email, currentPassword);
        await deleteUser(secondaryAuth.currentUser!);
        await secondarySignOut(secondaryAuth);
      } catch (authErr) {
        console.warn('Could not delete user from Firebase Auth (password may have been changed):', authErr);
      }

      // Delete the Firestore document
      const performer = {
        userId: currentAdmin?.uid || 'unknown_admin',
        userName: currentAdmin?.name || 'Administrator',
        userEmail: currentAdmin?.email || 'admin@notos.com'
      };

      await deleteUserProfile(user.uid, performer);
      showToast(`User ${user.name} deleted successfully.`);
    } catch (err: any) {
      showToast('Failed to delete user.', 'error');
    } finally {
      setSubmitting(false);
      if (secondaryAppInstance) {
        await deleteApp(secondaryAppInstance);
      }
    }
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) {
      showToast('All required fields (*) must be filled.', 'error');
      return;
    }
    if (password.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }
    if (role !== 'admin' && !assignedStoreId) {
      showToast('Non-admin users must be assigned to a store.', 'error');
      return;
    }

    setSubmitting(true);
    let secondaryAppInstance;
    try {
      // 1. Initialize temporary app to avoid signing out the current admin
      const tempAppName = `TempRegApp_${Date.now()}`;
      secondaryAppInstance = initializeApp(firebaseConfig, tempAppName);
      const secondaryAuth = getAuth(secondaryAppInstance);

      // 2. Create user inside secondary instance
      const credential = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
      const newUid = credential.user.uid;

      // Log out secondary auth immediately so it doesn't linger
      await secondarySignOut(secondaryAuth);

      // 3. Create the Firestore profile
      await createUserProfile(newUid, {
        name: name.trim(),
        email: email.trim(),
        role: role,
        assignedStoreId: role === 'admin' ? null : assignedStoreId,
        status: 'active',
        phone: phone.trim() || undefined,
        password: password.trim() // Save password configuration to support admin overrides
      });

      showToast(`User ${name} registered successfully.`);
      setIsAddOpen(false);
      setName('');
      setEmail('');
      setPassword('');
      setPhone('');
      setRole('store_user');
    } catch (err: any) {
      console.error(err);
      let msg = err.message || 'Failed to create user.';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'This email address is already in use.';
      }
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
      // Delete app to free memory and bindings
      if (secondaryAppInstance) {
        await deleteApp(secondaryAppInstance);
      }
    }
  };

  const handleToggleStatus = async (user: UserProfile) => {
    if (user.uid === currentAdmin?.uid) {
      showToast('You cannot suspend your own admin account!', 'error');
      return;
    }

    const newStatus = user.status === 'active' ? 'suspended' : 'active';
    const actionText = newStatus === 'active' ? 'activate' : 'deactivate';

    if (!window.confirm(`Are you sure you want to ${actionText} user "${user.name}"?`)) {
      return;
    }

    try {
      await updateUserProfile(user.uid, { status: newStatus }, {
        userId: currentAdmin!.uid,
        userName: currentAdmin!.name,
        userEmail: currentAdmin!.email
      });
      showToast(`User ${user.name} is now ${newStatus === 'active' ? 'active' : 'inactive'}.`);
    } catch (err: any) {
      showToast('Failed to update user status.', 'error');
    }
  };

  const handleResetPasswordDirect = async (user: UserProfile) => {
    if (user.uid === currentAdmin?.uid) {
      showToast('To change your own password, please use the settings tab.', 'error');
      return;
    }
    const newPassword = window.prompt(`Enter new password for ${user.name} (minimum 6 characters):`);
    if (newPassword === null) return; // Cancelled
    if (newPassword.trim().length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }

    setSubmitting(true);
    let secondaryAppInstance;
    try {
      const currentPassword = user.password || 'password123';

      // 1. Spin up temp app and sign in as the target user
      const tempAppName = `TempRegApp_${Date.now()}`;
      secondaryAppInstance = initializeApp(firebaseConfig, tempAppName);
      const secondaryAuth = getAuth(secondaryAppInstance);

      await signInWithEmailAndPassword(secondaryAuth, user.email, currentPassword);
      
      // 2. Change password in Firebase Auth
      await updatePassword(secondaryAuth.currentUser!, newPassword.trim());

      // Sign out temp session
      await secondarySignOut(secondaryAuth);

      // 3. Update password in Firestore user document
      await updateUserProfile(user.uid, {
        password: newPassword.trim()
      }, {
        userId: currentAdmin!.uid,
        userName: currentAdmin!.name,
        userEmail: currentAdmin!.email
      });

      showToast(`Password for ${user.name} has been changed successfully.`);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to change password directly.', 'error');
    } finally {
      setSubmitting(false);
      if (secondaryAppInstance) {
        await deleteApp(secondaryAppInstance);
      }
    }
  };

  const getStoreName = (id: string | null) => {
    if (!id) return 'All Stores';
    return stores.find(s => s.id === id)?.name || 'Unknown Store';
  };

  // UI helpers for Initials & Gradient Backgrounds
  const getAvatarGradient = (uid: string) => {
    const gradients = [
      'from-orange-400 to-amber-500',
      'from-emerald-400 to-teal-600',
      'from-purple-500 to-indigo-600',
      'from-amber-400 to-orange-600',
      'from-rose-400 to-pink-600',
      'from-cyan-400 to-blue-600'
    ];
    let hash = 0;
    for (let i = 0; i < uid.length; i++) {
      hash += uid.charCodeAt(i);
    }
    return gradients[hash % gradients.length];
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, Math.min(name.length, 2)).toUpperCase();
  };

  // Friendly Date Formatter
  const formatLastLogin = (lastLoginAt?: any) => {
    if (!lastLoginAt) return 'Never';
    
    const loginDate = typeof lastLoginAt.toDate === 'function' ? lastLoginAt.toDate() : new Date(lastLoginAt);
    const now = new Date();
    
    const isSameDay = (d1: Date, d2: Date) => 
      d1.getDate() === d2.getDate() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getFullYear() === d2.getFullYear();
      
    const isYesterday = (d1: Date, d2: Date) => {
      const yesterday = new Date(d2);
      yesterday.setDate(yesterday.getDate() - 1);
      return isSameDay(d1, yesterday);
    };

    const formatTime = (date: Date) => {
      let hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${hours}:${minutes} ${ampm}`;
    };

    if (isSameDay(loginDate, now)) {
      return `Today, ${formatTime(loginDate)}`;
    } else if (isYesterday(loginDate, now)) {
      return `Yesterday, ${formatTime(loginDate)}`;
    } else {
      const diffTime = Math.abs(now.getTime() - loginDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays < 7) {
        return `${diffDays} days ago`;
      } else {
        return loginDate.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric'
        }) + `, ${formatTime(loginDate)}`;
      }
    }
  };

  // 1. Calculate Aggregates for Metrics Row
  const totalCount = users.length;
  const storeUsersCount = users.filter(u => u.role === 'store_user').length;
  const adminsCount = users.filter(u => u.role === 'admin').length;
  const inactiveCount = users.filter(u => u.status === 'suspended').length;

  // 2. Perform Filtration
  const filteredUsers = users.filter(u => {
    // Search Query (name, email, phone)
    const matchesSearch = searchQuery.trim() === '' || 
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.phone && u.phone.includes(searchQuery));

    // Role
    const matchesRole = selectedRole === 'all' || u.role === selectedRole;

    // Store Scoping
    const matchesStore = selectedStore === 'all' || u.assignedStoreId === selectedStore;

    // Status
    const matchesStatus = selectedStatus === 'all' || 
      (selectedStatus === 'active' && u.status === 'active') ||
      (selectedStatus === 'suspended' && u.status === 'suspended');

    return matchesSearch && matchesRole && matchesStore && matchesStatus;
  });

  // 3. Paginate
  const totalFiltered = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  
  // Safe page range check
  const activePage = Math.min(currentPage, totalPages);
  const startIdx = (activePage - 1) * pageSize;
  const paginatedUsers = filteredUsers.slice(startIdx, startIdx + pageSize);

  const showingStart = totalFiltered === 0 ? 0 : startIdx + 1;
  const showingEnd = Math.min(startIdx + pageSize, totalFiltered);

  return (
    <div className="space-y-6 text-xs text-gray-700">
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-gray-900 md:text-2xl font-sans">
          Users Management
        </h2>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {/* Total Users */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex items-center space-x-4">
          <div className="p-3.5 rounded-xl bg-orange-50 text-orange-600 shrink-0">
            <UsersIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Total Users</div>
            <div className="text-2xl font-black text-gray-900 tracking-tight mt-0.5">{totalCount}</div>
            <div className="text-[10px] font-semibold text-gray-400 mt-0.5">All users in the system</div>
          </div>
        </div>

        {/* Store Users */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex items-center space-x-4">
          <div className="p-3.5 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Store Users</div>
            <div className="text-2xl font-black text-gray-900 tracking-tight mt-0.5">{storeUsersCount}</div>
            <div className="text-[10px] font-semibold text-gray-400 mt-0.5">Users assigned to stores</div>
          </div>
        </div>

        {/* Admins */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex items-center space-x-4">
          <div className="p-3.5 rounded-xl bg-purple-50 text-purple-600 shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Admins</div>
            <div className="text-2xl font-black text-gray-900 tracking-tight mt-0.5">{adminsCount}</div>
            <div className="text-[10px] font-semibold text-gray-400 mt-0.5">System administrators</div>
          </div>
        </div>

        {/* Inactive Users */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs flex items-center space-x-4">
          <div className="p-3.5 rounded-xl bg-amber-50 text-amber-600 shrink-0">
            <UserX className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Inactive Users</div>
            <div className="text-2xl font-black text-gray-900 tracking-tight mt-0.5">{inactiveCount}</div>
            <div className="text-[10px] font-semibold text-gray-400 mt-0.5">Disabled accounts</div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {/* Search Box */}
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              placeholder="Search users by name, email or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 placeholder-gray-400 focus:outline-none focus:border-orange-500 focus:bg-white transition-all font-sans"
            />
            <Search className="absolute right-3.5 top-3 h-4 w-4 text-gray-400" />
          </div>

          {/* Roles Selector */}
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="w-full sm:w-40 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 focus:outline-none focus:border-orange-500 focus:bg-white cursor-pointer transition-all font-sans"
          >
            <option value="all">All Roles</option>
            <option value="admin">Administrator</option>
            <option value="store_user">Store User</option>
          </select>

          {/* Stores Selector */}
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="w-full sm:w-40 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 focus:outline-none focus:border-orange-500 focus:bg-white cursor-pointer transition-all font-sans"
          >
            <option value="all">All Stores</option>
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* Status Selector */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full sm:w-40 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 focus:outline-none focus:border-orange-500 focus:bg-white cursor-pointer transition-all font-sans"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Inactive</option>
          </select>
        </div>

        <button
          onClick={() => setIsAddOpen(true)}
          className="w-full md:w-auto px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-orange-500/15 transition-all shrink-0 active:scale-[0.98] cursor-pointer font-sans"
        >
          <Plus className="h-4 w-4" />
          <span>Add New User</span>
        </button>
      </div>

      {/* Users List Table */}
      {loading ? (
        <div className="flex h-[30vh] items-center justify-center bg-white rounded-2xl border border-gray-100 shadow-xs">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-orange-500 border-t-transparent"></div>
        </div>
      ) : (
        <div className="overflow-hidden bg-white rounded-2xl border border-gray-100 shadow-xs">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-left font-sans">
              <thead className="bg-gray-50/50">
                <tr>
                  <th scope="col" className="px-6 py-4 text-xs font-extrabold text-gray-400 uppercase tracking-wider">User</th>
                  <th scope="col" className="px-6 py-4 text-xs font-extrabold text-gray-400 uppercase tracking-wider">Role</th>
                  <th scope="col" className="px-6 py-4 text-xs font-extrabold text-gray-400 uppercase tracking-wider">Store</th>
                  <th scope="col" className="px-6 py-4 text-xs font-extrabold text-gray-400 uppercase tracking-wider">Phone</th>
                  <th scope="col" className="px-6 py-4 text-xs font-extrabold text-gray-400 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-6 py-4 text-xs font-extrabold text-gray-400 uppercase tracking-wider">Last Login</th>
                  <th scope="col" className="px-6 py-4 text-right text-xs font-extrabold text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white text-xs">
                {paginatedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-gray-400 font-semibold">
                      No users match the selected filters.
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((u) => {
                    const isSelf = u.uid === currentAdmin?.uid;
                    const isActive = u.status === 'active';
                    return (
                      <tr key={u.uid} className={`hover:bg-gray-50/30 transition-colors ${!isActive ? 'bg-red-50/5' : ''}`}>
                        {/* User Identity */}
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center">
                            <div className={`h-9 w-9 rounded-full bg-gradient-to-tr ${getAvatarGradient(u.uid)} flex items-center justify-center text-white text-xs font-black tracking-wider shadow-sm shrink-0`}>
                              {getInitials(u.name)}
                            </div>
                            <div className="ml-3.5">
                              <div className="text-xs font-extrabold text-gray-900">{u.name}</div>
                              <div className="text-[10px] text-gray-400 font-bold mt-0.5">{u.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Role Badging */}
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wide border ${
                            u.role === 'admin' 
                              ? 'bg-purple-50 text-purple-600 border-purple-100' 
                              : 'bg-orange-50 text-orange-600 border-orange-100'
                          }`}>
                            {u.role === 'admin' ? 'Administrator' : 'Store User'}
                          </span>
                        </td>

                        {/* Store Context */}
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wide border ${
                            !u.assignedStoreId 
                              ? 'bg-purple-50/50 text-purple-600 border-purple-100/50' 
                              : 'bg-orange-50/50 text-orange-600 border-orange-100/50'
                          }`}>
                            {getStoreName(u.assignedStoreId)}
                          </span>
                        </td>

                        {/* Phone Number */}
                        <td className="whitespace-nowrap px-6 py-4 text-xs font-bold text-gray-600">
                          {u.phone || '—'}
                        </td>

                        {/* Status badge */}
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wide border ${
                            isActive 
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                              : 'bg-red-50 text-red-600 border-red-100'
                          }`}>
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>

                        {/* Last Login timestamps */}
                        <td className="whitespace-nowrap px-6 py-4 text-xs text-gray-500 font-semibold">
                          {formatLastLogin(u.lastLoginAt)}
                        </td>

                        {/* Action cell */}
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <div className="flex items-center justify-end space-x-1.5 relative">
                            {/* Pencil Edit button */}
                            <button
                              onClick={() => handleOpenEdit(u)}
                              className="p-2 border border-gray-200 hover:border-gray-300 rounded-xl hover:bg-gray-50 text-gray-400 hover:text-gray-900 transition-all cursor-pointer"
                              title="Edit User"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>

                            {/* Padlock status lock button */}
                            <button
                              onClick={() => handleToggleStatus(u)}
                              disabled={isSelf}
                              className={`p-2 border rounded-xl transition-all ${
                                isSelf
                                  ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                                  : isActive 
                                    ? 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-400 hover:text-gray-900 cursor-pointer' 
                                    : 'border-red-200 bg-red-50/50 hover:bg-red-50 text-red-500 cursor-pointer'
                              }`}
                              title={isActive ? 'Deactivate User (Lock)' : 'Activate User (Unlock)'}
                            >
                              {isActive ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                            </button>

                            {/* Contextual actions menu button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuUid(activeMenuUid === u.uid ? null : u.uid);
                              }}
                              className="p-2 border border-gray-200 hover:border-gray-300 rounded-xl hover:bg-gray-50 text-gray-400 hover:text-gray-900 transition-all cursor-pointer"
                              title="More Options"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>

                            {/* Contextual absolute menu dropdown */}
                            {activeMenuUid === u.uid && (
                              <div 
                                className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-100 rounded-2xl shadow-xl z-30 p-1.5 space-y-1 text-left animate-fade-in font-sans"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => {
                                    setActiveMenuUid(null);
                                    handleResetPasswordDirect(u);
                                  }}
                                  className="w-full flex items-center px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer"
                                >
                                  <KeyRound className="h-3.5 w-3.5 mr-2 text-gray-400" />
                                  Reset Password
                                </button>
                                
                                {!isSelf && (
                                  <button
                                    onClick={() => {
                                      setActiveMenuUid(null);
                                      handleDeleteUser(u);
                                    }}
                                    className="w-full flex items-center px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-2 text-red-400" />
                                    Delete User
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Controls */}
          <div className="flex flex-col sm:flex-row justify-between items-center px-6 py-4 border-t border-gray-100 text-xs gap-4 bg-white font-sans">
            <div className="text-gray-400 font-bold">
              Showing {showingStart} to {showingEnd} of {totalFiltered} users
            </div>
            
            <div className="flex items-center space-x-1">
              <button
                disabled={activePage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className={`p-2 rounded-xl border transition-all ${
                  activePage === 1 
                    ? 'border-gray-100 text-gray-300 cursor-not-allowed' 
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900 cursor-pointer'
                }`}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`px-3 py-1.5 rounded-xl border font-bold transition-all text-[10px] cursor-pointer ${
                    activePage === p
                      ? 'bg-orange-500 border-orange-500 text-white shadow-md shadow-orange-500/10'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {p}
                </button>
              ))}

              <button
                disabled={activePage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className={`p-2 rounded-xl border transition-all ${
                  activePage === totalPages 
                    ? 'border-gray-100 text-gray-300 cursor-not-allowed' 
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900 cursor-pointer'
                }`}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Dialog Sheet */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs md:items-center p-0 md:p-4">
          <div className="w-full max-w-md bg-white rounded-t-2xl md:rounded-2xl flex flex-col shadow-2xl animate-slide-up font-sans">
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">Add New User</h3>
              <button 
                onClick={() => setIsAddOpen(false)} 
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUserSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Full Name *</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:bg-white focus:outline-none transition-colors"
                  placeholder="e.g. John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Email Address *</label>
                <input
                  type="email"
                  required
                  className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:bg-white focus:outline-none transition-colors"
                  placeholder="name@notos.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Temporary Password *</label>
                  <input
                    type="password"
                    required
                    className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:bg-white focus:outline-none transition-colors"
                    placeholder="Min 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Phone Number</label>
                  <input
                    type="text"
                    className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:bg-white focus:outline-none transition-colors"
                    placeholder="e.g. 0712 345 678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">System Role *</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-bold text-gray-600 focus:border-orange-500 focus:bg-white focus:outline-none cursor-pointer transition-colors"
                  >
                    <option value="store_user">Store User</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>

                {role !== 'admin' && (
                  <div>
                    <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Assign Store *</label>
                    <select
                      value={assignedStoreId}
                      onChange={(e) => setAssignedStoreId(e.target.value)}
                      className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-bold text-gray-600 focus:border-orange-500 focus:bg-white focus:outline-none cursor-pointer transition-colors"
                    >
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-4 flex justify-center py-3 px-4 rounded-xl text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 focus:outline-none disabled:opacity-50 transition-colors shadow-lg shadow-orange-500/15 cursor-pointer font-sans"
              >
                {submitting ? 'Registering...' : 'Register User'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Dialog Sheet */}
      {isEditOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs md:items-center p-0 md:p-4">
          <div className="w-full max-w-md bg-white rounded-t-2xl md:rounded-2xl flex flex-col shadow-2xl animate-slide-up font-sans">
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">Edit User Profile</h3>
              <button 
                onClick={() => { setIsEditOpen(false); setEditingUser(null); setEditPassword(''); }} 
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateUserSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Full Name *</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:bg-white focus:outline-none transition-colors"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Email Address *</label>
                  <input
                    type="email"
                    required
                    className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:bg-white focus:outline-none transition-colors"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Phone Number</label>
                  <input
                    type="text"
                    className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:bg-white focus:outline-none transition-colors"
                    placeholder="e.g. 0712 345 678"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* Password field shown in Edit modal */}
              <div className="bg-orange-50/50 border border-orange-100 rounded-xl p-3.5 space-y-2">
                <div className="text-[10px] font-bold text-orange-700">
                  Credentials Sync (Direct Pass Override)
                </div>
                <label className="block text-[10px] font-extrabold text-orange-600 uppercase tracking-wider">New Password (Leave blank to keep current)</label>
                <input
                  type="password"
                  className="block w-full rounded-xl border border-orange-200 bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 focus:border-orange-500 focus:outline-none transition-colors"
                  placeholder="Minimum 6 characters"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">System Role *</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                    className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-bold text-gray-600 focus:border-orange-500 focus:bg-white focus:outline-none cursor-pointer transition-colors"
                  >
                    <option value="store_user">Store User</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>

                {editRole !== 'admin' && (
                  <div>
                    <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Assign Store *</label>
                    <select
                      value={editStoreId}
                      onChange={(e) => setEditStoreId(e.target.value)}
                      className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-bold text-gray-600 focus:border-orange-500 focus:bg-white focus:outline-none cursor-pointer transition-colors"
                    >
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">User Status *</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as 'active' | 'suspended')}
                    className="mt-1 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-bold text-gray-600 focus:border-orange-500 focus:bg-white focus:outline-none cursor-pointer transition-colors"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Password reset direct action button inside modal */}
              <div className="pt-2 border-t border-gray-100 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => handleResetPasswordDirect(editingUser)}
                  className="w-full py-2.5 px-4 rounded-xl border border-orange-200 hover:border-orange-300 bg-orange-50/40 hover:bg-orange-50 text-orange-600 font-bold text-xs flex items-center justify-center space-x-2 transition-colors cursor-pointer"
                >
                  <KeyRound className="h-4 w-4" />
                  <span>Reset Password Directly (Without Email)</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 flex justify-center py-3 px-4 rounded-xl text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 focus:outline-none disabled:opacity-50 transition-colors shadow-lg shadow-orange-500/15 cursor-pointer font-sans"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
