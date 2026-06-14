import React, { useState, useEffect } from 'react';
import { subscribeToAuditLogs } from '../../services/dbService';
import { AuditLog as AuditLogType } from '../../types/models';
import { History, Search } from 'lucide-react';
import { formatTimeAgo } from '../../utils/formatters';

export const AuditLog: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToAuditLogs(100, (logsList) => {
      setLogs(logsList);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredLogs = logs.filter(log => 
    log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.details.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      
      {/* Header Info */}
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-gray-900 md:text-2xl">
          System Audit Log
        </h2>
        <p className="text-xs text-gray-500 font-medium mt-0.5">
          Read-only, secure logs capturing all database write, update, and configuration events.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 pl-10 text-xs font-semibold text-gray-700 placeholder-gray-400 focus:border-orange-500 focus:outline-none"
            placeholder="Search by action, email, name, or description details..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-400">
            <Search className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div className="flex h-[30vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-orange-500 border-t-transparent"></div>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm text-center">
          <History className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-gray-600">No logs matching search criteria</p>
        </div>
      ) : (
        <div className="overflow-hidden bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-left">
              <thead className="bg-gray-50/70">
                <tr>
                  <th scope="col" className="px-6 py-3.5 text-xs font-bold text-gray-400 uppercase tracking-wider">Event Action</th>
                  <th scope="col" className="px-6 py-3.5 text-xs font-bold text-gray-400 uppercase tracking-wider">Operator</th>
                  <th scope="col" className="px-6 py-3.5 text-xs font-bold text-gray-400 uppercase tracking-wider">Details Description</th>
                  <th scope="col" className="px-6 py-3.5 text-xs font-bold text-gray-400 uppercase tracking-wider">IP Address</th>
                  <th scope="col" className="px-6 py-3.5 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white text-xs font-semibold text-gray-600">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="inline-flex px-2 py-0.5 rounded-lg text-[10px] font-black border border-gray-200 bg-gray-50 text-gray-700 uppercase tracking-wider">
                        {log.action}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div>
                        <div className="font-extrabold text-gray-900">{log.userName}</div>
                        <div className="text-gray-400 font-medium">{log.userEmail}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-sm truncate text-gray-500 font-medium" title={log.details}>
                      {log.details}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-gray-400 font-medium">
                      {log.ipAddress || 'Unknown'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-gray-400 font-medium">
                      {formatTimeAgo(log.timestamp)}
                    </td>
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
