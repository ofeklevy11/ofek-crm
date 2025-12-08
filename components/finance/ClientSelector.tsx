"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, X, Database } from "lucide-react";

interface Client {
  id: number;
  name: string;
  data: any;
  tableSlug: string;
}

interface Table {
  id: number;
  name: string;
  slug: string;
}

interface ClientSelectorProps {
  onSelect: (client: Client | null) => void;
  selectedClient: Client | null;
}

export default function ClientSelector({
  onSelect,
  selectedClient,
}: ClientSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTableSlug, setActiveTableSlug] = useState<string>("");
  const [tables, setTables] = useState<Table[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTables, setIsLoadingTables] = useState(true);

  // Fetch available tables
  useEffect(() => {
    async function fetchTables() {
      try {
        const response = await fetch("/api/tables");
        if (response.ok) {
          const data = await response.json();
          setTables(data);
          if (data.length > 0) {
            setActiveTableSlug(data[0].slug);
          }
        } else {
          console.error("Failed to fetch tables");
        }
      } catch (error) {
        console.error("Error fetching tables:", error);
      } finally {
        setIsLoadingTables(false);
      }
    }
    fetchTables();
  }, []);

  // Debounced search function
  const searchClients = useCallback(
    async (tableSlug: string, query: string) => {
      if (!tableSlug) return;

      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          table: tableSlug,
          search: query,
        });

        const response = await fetch(`/api/finance/search-clients?${params}`);
        if (response.ok) {
          const data = await response.json();
          setClients(data);
        } else {
          console.error("Failed to fetch clients");
          setClients([]);
        }
      } catch (error) {
        console.error("Error fetching clients:", error);
        setClients([]);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Debounce effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (isOpen && activeTableSlug) {
        searchClients(activeTableSlug, searchQuery);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchQuery, activeTableSlug, isOpen, searchClients]);

  // Load clients when opening
  useEffect(() => {
    if (isOpen && activeTableSlug) {
      searchClients(activeTableSlug, searchQuery);
    }
  }, [isOpen, activeTableSlug]); // Don't include searchClients and searchQuery here

  const handleTableChange = (slug: string) => {
    setActiveTableSlug(slug);
    setSearchQuery(""); // Reset search when changing tables
  };

  const handleSelectClient = (client: Client) => {
    onSelect(client);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleClear = () => {
    onSelect(null);
    setSearchQuery("");
  };

  return (
    <div className="relative">
      {/* Selected Client Display / Trigger Button */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex-1 flex items-center justify-between px-4 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors"
        >
          <span className={selectedClient ? "text-gray-900" : "text-gray-500"}>
            {selectedClient ? selectedClient.name : "בחר לקוח מטבלה קיימת"}
          </span>
          <Search className="w-4 h-4 text-gray-400" />
        </button>
        {selectedClient && (
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-red-50 hover:border-red-300 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500 hover:text-red-600" />
          </button>
        )}
      </div>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
          {/* Table Selection */}
          <div className="p-3 border-b border-gray-200 bg-gray-50">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              בחר טבלת מקור
            </label>
            <div className="relative">
              <Database className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={activeTableSlug}
                onChange={(e) => handleTableChange(e.target.value)}
                disabled={isLoadingTables}
                className="w-full pr-10 pl-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                {isLoadingTables ? (
                  <option>טוען טבלאות...</option>
                ) : tables.length === 0 ? (
                  <option value="">אין טבלאות זמינות</option>
                ) : (
                  tables.map((table) => (
                    <option key={table.id} value={table.slug}>
                      {table.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Search Box */}
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חפש לקוח..."
                className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
            </div>
          </div>

          {/* Results List */}
          <div className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-gray-500">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-sm">טוען לקוחות...</p>
              </div>
            ) : clients.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <p className="text-sm">לא נמצאו לקוחות (או לא נבחרה טבלה)</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {clients.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => handleSelectClient(client)}
                    className="w-full px-4 py-3 text-right hover:bg-gray-50 transition-colors"
                  >
                    <div className="font-medium text-gray-900">
                      {client.name}
                    </div>
                    {/* Display extra fields if available to help identify */}
                    {Object.entries(client.data)
                      .slice(0, 3)
                      .map(([key, value]) => {
                        if (
                          key !== "c_name" &&
                          typeof value === "string" &&
                          value.length < 50
                        ) {
                          return (
                            <div
                              key={key}
                              className="text-xs text-gray-500 mt-1 truncate"
                            >
                              {key}: {value}
                            </div>
                          );
                        }
                        return null;
                      })}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 bg-gray-50 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              {clients.length} רשומות נמצאו
            </p>
          </div>
        </div>
      )}

      {/* Overlay to close dropdown when clicking outside */}
      {isOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
      )}
    </div>
  );
}
