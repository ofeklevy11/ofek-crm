"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Users, Globe, X } from "lucide-react";

interface Client {
  id: number;
  name: string;
  data: any;
  tableSlug: string;
}

interface ClientSelectorProps {
  onSelect: (client: Client | null) => void;
  selectedClient: Client | null;
}

type TableType = "digital-marketing" | "work-web-design";

export default function ClientSelector({
  onSelect,
  selectedClient,
}: ClientSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TableType>("digital-marketing");
  const [searchQuery, setSearchQuery] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Debounced search function
  const searchClients = useCallback(async (table: TableType, query: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        table: table,
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
  }, []);

  // Debounce effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (isOpen) {
        searchClients(activeTab, searchQuery);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchQuery, activeTab, isOpen, searchClients]);

  // Load clients when opening or changing tab
  useEffect(() => {
    if (isOpen) {
      searchClients(activeTab, searchQuery);
    }
  }, [isOpen, activeTab]); // Don't include searchClients and searchQuery here

  const handleTabChange = (tab: TableType) => {
    setActiveTab(tab);
    setSearchQuery(""); // Reset search when changing tabs
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
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              type="button"
              onClick={() => handleTabChange("digital-marketing")}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === "digital-marketing"
                  ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Users className="w-4 h-4" />
                <span>שיווק דיגיטלי</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("work-web-design")}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === "work-web-design"
                  ? "text-purple-600 border-b-2 border-purple-600 bg-purple-50"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Globe className="w-4 h-4" />
                <span>בניית אתרים</span>
              </div>
            </button>
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
                <p className="text-sm">לא נמצאו לקוחות</p>
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
                    {client.data["company"] && (
                      <div className="text-xs text-gray-500 mt-1">
                        {client.data["company"]}
                      </div>
                    )}
                    {client.data["phone-number"] && (
                      <div className="text-xs text-gray-400 mt-1">
                        {client.data["phone-number"]}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 bg-gray-50 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              {clients.length} לקוחות נמצאו
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
