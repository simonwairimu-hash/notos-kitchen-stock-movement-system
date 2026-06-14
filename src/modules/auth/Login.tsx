import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { 
  createUserProfile, 
  createStore, 
  createCategory, 
  createDepartment, 
  createUnit 
} from '../../services/dbService';
import { Package, Mail, Lock, User, Eye, EyeOff, ShieldAlert, Award } from 'lucide-react';

export const Login: React.FC = () => {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Route state errors (e.g. from redirect guards)
  const locationState = location.state as { error?: string; from?: { pathname: string } } | null;
  const redirectError = locationState?.error || null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(redirectError);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Bootstrapping states
  const [isSystemEmpty, setIsSystemEmpty] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [setupStep, setSetupStep] = useState(1); // 1 = Detect, 2 = Create Admin

  // Check if system is bootstrapped in Firestore
  useEffect(() => {
    const checkSystemState = async () => {
      try {
        const docRef = doc(db, 'system', 'bootstrap');
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
          setIsSystemEmpty(true);
        }
      } catch (err) {
        console.error('System check failed:', err);
      }
    };
    checkSystemState();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const emailKey = email.trim().toLowerCase();
    const attemptRef = doc(db, 'loginAttempts', emailKey);

    try {
      // 1. Check rate limit
      const attemptSnap = await getDoc(attemptRef);
      if (attemptSnap.exists()) {
        const data = attemptSnap.data();
        const attempts = data.attempts || 0;
        const lastAttemptTime = data.lastAttemptTime?.toDate() || new Date(0);
        const now = new Date();
        const timeDiff = now.getTime() - lastAttemptTime.getTime();

        if (attempts >= 5 && timeDiff < 15 * 60 * 1000) {
          setError('Too many login attempts. Try again later.');
          setLoading(false);
          return;
        }
      }

      // 2. Perform authentication
      await signInWithEmailAndPassword(auth, email.trim(), password);

      // 3. Success: Reset rate limiter count
      if (attemptSnap.exists()) {
        await deleteDoc(attemptRef);
      }

      const from = locationState?.from?.pathname || '/';
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error('Login error:', err);

      // 4. Increment rate limiter attempts
      try {
        const attemptSnap = await getDoc(attemptRef);
        let attempts = 1;
        if (attemptSnap.exists()) {
          const data = attemptSnap.data();
          const prevAttempts = data.attempts || 0;
          const lastAttemptTime = data.lastAttemptTime?.toDate() || new Date(0);
          const now = new Date();
          const timeDiff = now.getTime() - lastAttemptTime.getTime();

          if (timeDiff < 15 * 60 * 1000) {
            attempts = prevAttempts + 1;
          }
        }

        await setDoc(attemptRef, {
          email: emailKey,
          attempts: attempts,
          lastAttemptTime: serverTimestamp()
        });
      } catch (dbErr) {
        console.error('Rate limit logging failed:', dbErr);
      }

      let msg = 'Failed to sign in. Please check your credentials.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'Invalid email or password.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Invalid email address format.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Too many failed login attempts. Please try again later.';
      }
      setError(msg);
      // Clean up local auth sessions if there was a problem
      await logout();
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSuccessMessage('Password reset link sent! Please check your email.');
    } catch (err: any) {
      console.error('Password reset error:', err);
      let msg = 'Failed to send password reset email. Please try again.';
      if (err.code === 'auth/user-not-found') {
        msg = 'No user account found with this email address.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Invalid email address format.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSetupSystem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminName.trim() || !email.trim() || !password) {
      setError('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Create auth account
      const authResult = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const uid = authResult.user.uid;

      // 2. Create default store
      const storeId = await createStore({
        name: 'Main Store',
        location: 'Central Storage',
        description: 'Default primary warehouse and pantry'
      }, {
        userId: uid,
        userName: adminName,
        userEmail: email
      });

      // 3. Create Admin profile doc
      await createUserProfile(uid, {
        email: email.trim(),
        name: adminName.trim(),
        role: 'admin',
        assignedStoreId: null, // Admins manage all stores
        status: 'active'
      });

      // 4. Seed categories
      await createCategory('Spices', 'Spices and seasonings');
      await createCategory('Cereals', 'Grains, flour, and cereals');
      await createCategory('Alcoholic Beverages', 'Wine, beer, spirits');
      await createCategory('Soft Drinks', 'Soda, water, juices');
      await createCategory('Meat', 'Fresh meat and poultry');
      await createCategory('Farmers Choice', 'Farmers Choice brand products');
      await createCategory('Ice Cream', 'Ice cream and dairy desserts');
      await createCategory('Cutlery', 'Knives, spoons, forks, plates');
      await createCategory('Tea & Services', 'Hot beverage service');
      await createCategory('Others', 'Miscellaneous kitchen items');

      // 5. Seed departments
      await createDepartment('Main Kitchen', 'Main cooking and food preparation');
      await createDepartment('APA', 'Administration and pantry allocation');
      await createDepartment('Tea & Services', 'Hot drink service and equipment');
      await createDepartment('Cutlery Movement', 'Tableware and cutlery tracking');

      // 6. Seed units
      await createUnit('Kg', 'kg');
      await createUnit('Litres', 'l');
      await createUnit('Pcs', 'pcs');
      await createUnit('Trays', 'trays');
      await createUnit('Cartons', 'cartons');
      await createUnit('Crates', 'crates');
      await createUnit('Packets', 'packets');
      await createUnit('Bale', 'bale');
      await createUnit('Bottles', 'bottles');
      await createUnit('Boxes', 'boxes');
      await createUnit('Tins', 'tins');

      // 7. Lock the system by writing the bootstrap document
      await setDoc(doc(db, 'system', 'bootstrap'), {
        bootstrapped: true,
        bootstrappedAt: serverTimestamp(),
        bootstrappedBy: uid
      });

      setIsSystemEmpty(false);
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('Bootstrap error:', err);
      setError(err.message || 'An error occurred during system initialization.');
      await logout();
    } finally {
      setLoading(false);
    }
  };

  if (isSystemEmpty) {
    return (
      <div className="bg-white px-6 py-10 shadow-xl rounded-2xl border border-gray-100 sm:px-10">
        <div className="flex flex-col items-center mb-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 mb-4 animate-pulse">
            <Award className="h-8 w-8" />
          </div>
          <h2 className="text-center text-2xl font-bold tracking-tight text-gray-900">
            System Initialization Wizard
          </h2>
          <p className="mt-2 text-center text-sm text-gray-500 max-w-xs">
            No administrator accounts detected. Let's seed your system with its first admin account.
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-center space-x-2 rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700 border border-red-200">
            <ShieldAlert className="h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSetupSystem}>
          <div>
            <label className="block text-sm font-semibold text-gray-700">Administrator Name</label>
            <div className="mt-1 relative">
              <input
                type="text"
                required
                className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pl-11 text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm"
                placeholder="e.g. John Doe"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
              />
              <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-400">
                <User className="h-4 w-4" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700">Admin Email Address</label>
            <div className="mt-1 relative">
              <input
                type="email"
                required
                className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pl-11 text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm"
                placeholder="admin@notoskitchen.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-400">
                <Mail className="h-4 w-4" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700">Secure Password</label>
            <div className="mt-1 relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pl-11 pr-10 text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-400">
                <Lock className="h-4 w-4" />
              </div>
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 rounded-xl text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 transition-colors mt-6"
          >
            {loading ? 'Initializing System...' : 'Initialize & Sign In'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="bg-white px-6 py-10 shadow-xl rounded-2xl border border-gray-100 sm:px-10">
      <div className="flex flex-col items-center mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-md shadow-orange-500/25 mb-3">
          <Package className="h-6 w-6" />
        </div>
        <h2 className="text-center text-xl font-bold tracking-tight text-gray-900">
          Notos Kitchen Stock Movement
        </h2>
        <p className="mt-1 text-center text-xs text-gray-500 uppercase tracking-widest font-semibold">
          Stock & Inventory tracking
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-center space-x-2 rounded-lg bg-red-50 p-3 text-xs font-medium text-red-700 border border-red-200">
          <ShieldAlert className="h-4 w-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 flex items-center space-x-2 rounded-lg bg-emerald-50 p-3 text-xs font-medium text-emerald-700 border border-emerald-200">
          <ShieldAlert className="h-4 w-4 shrink-0 text-emerald-600 rotate-180" />
          <span>{successMessage}</span>
        </div>
      )}

      {isForgotPassword ? (
        <form className="space-y-4" onSubmit={handleForgotPassword}>
          <div>
            <h3 className="text-sm font-bold text-gray-800">Forgot Password?</h3>
            <p className="text-xs text-gray-500 mt-1 mb-3">
              Enter your email address and we'll send you a secure link to reset your password.
            </p>
            <label className="block text-sm font-semibold text-gray-700">Email Address</label>
            <div className="mt-1 relative">
              <input
                type="email"
                required
                className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pl-11 text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-400">
                <Mail className="h-4 w-4" />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 rounded-xl text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 transition-colors mt-6 shadow-md shadow-orange-500/10"
          >
            {loading ? 'Sending link...' : 'Send Reset Link'}
          </button>

          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(false);
                setError(null);
                setSuccessMessage(null);
              }}
              className="text-xs font-bold text-orange-500 hover:text-orange-600 transition-colors"
            >
              Back to Sign In
            </button>
          </div>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={handleLogin}>
          <div>
            <label className="block text-sm font-semibold text-gray-700">Email Address</label>
            <div className="mt-1 relative">
              <input
                type="email"
                required
                className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pl-11 text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-400">
                <Mail className="h-4 w-4" />
              </div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center">
              <label className="block text-sm font-semibold text-gray-700">Password</label>
              <button
                type="button"
                onClick={() => {
                  setIsForgotPassword(true);
                  setError(null);
                  setSuccessMessage(null);
                }}
                className="text-xs font-bold text-orange-500 hover:text-orange-600 transition-colors"
              >
                Forgot Password?
              </button>
            </div>
            <div className="mt-1 relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pl-11 pr-10 text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-400">
                <Lock className="h-4 w-4" />
              </div>
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 rounded-xl text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 transition-colors mt-6 shadow-md shadow-orange-500/10"
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      )}
    </div>
  );
};
