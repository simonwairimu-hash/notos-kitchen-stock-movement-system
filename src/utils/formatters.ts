import { Timestamp } from 'firebase/firestore';

/**
 * Format a number as KES currency.
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

/**
 * Return a human-readable relative time string (e.g. "5m ago", "Yesterday").
 * Supports JS Date, Firestore Timestamp, and serialized Firestore timestamps.
 */
export function formatTimeAgo(timestamp: any): string {
  if (!timestamp) return 'Unknown time';
  
  let date: Date;
  if (timestamp instanceof Timestamp) {
    date = timestamp.toDate();
  } else if (typeof timestamp === 'object' && timestamp.seconds !== undefined) {
    // For offline-restored Firestore Timestamp objects
    date = new Timestamp(timestamp.seconds, timestamp.nanoseconds).toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
    date = new Date(timestamp);
  } else {
    return 'Unknown time';
  }
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  if (diffMs < 0) return 'Just now'; // Safety check for slight client clock differences
  
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'Just now';
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: '2-digit'
  });
}
