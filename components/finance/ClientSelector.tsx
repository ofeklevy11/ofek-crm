"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, X, Database, Users } from "lucide-react";

interface Client {
  id: number;
  name: string;
  data: any;
  tableSlug: string;
}

interface FinanceClient {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  businessName: string | null;
}

interface Table {
  id: number;
  name: string;
  slug: string;
}

type SourceType = "table" | "finance";

interface ClientSelectorProps {
  onSelect: (client: Client | null) => void;
  selectedClient: Client | null;
}

export default function ClientSelector({
  onSelect,
  selectedClient,
}: ClientSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sourceType, setSourceType] = useState<SourceType>("table");
  const [activeTableSlug, setActiveTableSlug] = useState<string>("");
  const [tables, setTables] = useState<Table[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [financeClients, setFinanceClients] = useState<FinanceClient[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTables, setIsLoadingTables] = useState(true);
  const [isLoadingFinanceClients, setIsLoadingFinanceClients] = useState(false);

  // Fetch tables and finance clients in parallel on mount
  useEffect(() => {
    async function fetchInitialData() {
      setIsLoadingFinanceClients(true);
      try {
        const [tablesRes, financeRes] = await Promise.all([
          fetch("/api/tables"),
          fetch("/api/finance/clients"),
        ]);

        if (tablesRes.ok) {
          const json = await tablesRes.json();
          setTables(json.data ?? json);
        } else {
          console.error("Failed to fetch tables");
        }

        if (financeRes.ok) {
          setFinanceClients(await financeRes.json());
        } else {
          console.error("Failed to fetch finance clients");
        }
      } catch (error) {
        console.error("Error fetching initial data:", error);
      } finally {
        setIsLoadingTables(false);
        setIsLoadingFinanceClients(false);
      }
    }
    fetchInitialData();
  }, []);

  // Debounced search function for table clients
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
    [],
  );

  // Debounce effect for table clients
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (isOpen && activeTableSlug && sourceType === "table") {
        searchClients(activeTableSlug, searchQuery);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, activeTableSlug, isOpen, searchClients, sourceType]);

  // Load clients when opening or changing table
  useEffect(() => {
    if (isOpen && activeTableSlug && sourceType === "table") {
      searchClients(activeTableSlug, searchQuery);
    } else if (!activeTableSlug) {
      setClients([]);
    }
  }, [isOpen, activeTableSlug, sourceType]);

  const handleTableChange = (slug: string) => {
    setActiveTableSlug(slug);
    setSearchQuery("");
  };

  const handleSourceTypeChange = (type: SourceType) => {
    setSourceType(type);
    setSearchQuery("");
  };

  const handleSelectClient = (client: Client) => {
    onSelect(client);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleSelectFinanceClient = (financeClient: FinanceClient) => {
    // Convert finance client to Client format
    const client: Client = {
      id: financeClient.id,
      name: financeClient.name,
      data: {
        email: financeClient.email,
        phone: financeClient.phone,
        businessName: financeClient.businessName,
      },
      tableSlug: "finance-clients",
    };
    onSelect(client);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleClear = () => {
    onSelect(null);
    setSearchQuery("");
  };

  // Filter finance clients by search query
  const filteredFinanceClients = financeClients.filter((client) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      client.name.toLowerCase().includes(query) ||
      (client.email && client.email.toLowerCase().includes(query)) ||
      (client.businessName && client.businessName.toLowerCase().includes(query)) ||
      (client.phone && client.phone.includes(query))
    );
  });

  return (
    <div className="relative">
      {/* Selected Client Display / Trigger Button */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex-1 flex items-center justify-between px-4 py-3 border border-gray-200 rounded-xl bg-white hover:bg-gray-50 focus:ring-2 focus:ring-[#4f95ff] focus:border-[#4f95ff] transition-all text-sm"
        >
          <span
            className={
              selectedClient ? "text-gray-900 font-medium" : "text-gray-500"
            }
          >
            {selectedClient ? selectedClient.name : "בחר לקוח מטבלה קיימת"}
          </span>
          <Search className="w-4 h-4 text-gray-400" />
        </button>
        {selectedClient && (
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-2 border border-red-100 rounded-xl bg-white hover:bg-red-50 hover:border-red-200 transition-colors group"
          >
            <X className="w-4 h-4 text-gray-400 group-hover:text-red-500" />
          </button>
        )}
      </div>

      {/* Dropdown Panel */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Source Type Selection - Two Columns */}
            <div className="p-3 border-b border-gray-100 bg-gray-50/50">
              <label className="block text-xs font-semibold text-gray-500 mb-2 px-1">
                בחר מקור לקוחות
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSourceTypeChange("table")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${
                    sourceType === "table"
                      ? "border-[#4f95ff] bg-blue-50/50 text-[#4f95ff]"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <Database className="w-4 h-4" />
                  <span className="text-sm font-medium">בחר מטבלה</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSourceTypeChange("finance")}
                  className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all ${
                    sourceType === "finance"
                      ? "border-[#a24ec1] bg-purple-50/50 text-[#a24ec1]"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span className="text-sm font-medium">לקוחות (כספים)</span>
                </button>
              </div>
            </div>

            {/* Table Source Content */}
            {sourceType === "table" && (
              <>
                {/* Table Selection */}
                <div className="p-3 border-b border-gray-100 bg-white">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 px-1">
                    בחר טבלת מקור
                  </label>
                  <div className="relative">
                    <Database className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <select
                      value={activeTableSlug}
                      onChange={(e) => handleTableChange(e.target.value)}
                      disabled={isLoadingTables}
                      className="w-full pr-10 pl-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#4f95ff] focus:border-[#4f95ff] bg-white transition-colors"
                    >
                      {isLoadingTables ? (
                        <option>טוען טבלאות...</option>
                      ) : tables.length === 0 ? (
                        <option value="">אין טבלאות זמינות</option>
                      ) : (
                        <>
                          <option value="">בחר טבלה...</option>
                          {tables.map((table) => (
                            <option key={table.id} value={table.slug}>
                              {table.name}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </div>
                </div>

                {/* Search Box - only show if table is selected */}
                {activeTableSlug && (
                  <div className="p-3 border-b border-gray-100">
                    <div className="relative">
                      <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="חפש לקוח..."
                        className="w-full pr-10 pl-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#4f95ff] focus:border-[#4f95ff] text-sm transition-colors"
                        autoFocus
                      />
                    </div>
                  </div>
                )}

                {/* Results List */}
                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                  {!activeTableSlug ? (
                    <div className="p-8 text-center text-gray-500">
                      <Database className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm font-medium">בחר טבלת מקור</p>
                      <p className="text-xs mt-1 text-gray-400">
                        יש לבחור טבלה כדי לראות את הלקוחות
                      </p>
                    </div>
                  ) : isLoading ? (
                    <div className="p-8 text-center text-gray-500">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-200 border-t-[#4f95ff] mx-auto"></div>
                      <p className="mt-2 text-xs font-medium">טוען לקוחות...</p>
                    </div>
                  ) : clients.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      <p className="text-sm">
                        {searchQuery
                          ? "לא נמצאו תוצאות"
                          : "אין רשומות בטבלה זו"}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {clients.map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => handleSelectClient(client)}
                          className="w-full px-4 py-3 text-right hover:bg-gray-50 transition-colors group"
                        >
                          <div className="font-medium text-sm text-gray-900 group-hover:text-[#4f95ff] transition-colors">
                            {client.name}
                          </div>
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
                <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-xs text-gray-400">
                  <span>
                    {activeTableSlug ? `${clients.length} רשומות` : ""}
                  </span>
                  {activeTableSlug && (
                    <span className="bg-gray-200/50 px-1.5 py-0.5 rounded">
                      {tables.find((t) => t.slug === activeTableSlug)?.name ||
                        activeTableSlug}
                    </span>
                  )}
                </div>
              </>
            )}

            {/* Finance Clients Source Content */}
            {sourceType === "finance" && (
              <>
                {/* Search Box */}
                <div className="p-3 border-b border-gray-100">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="חפש לקוח לפי שם, אימייל או חברה..."
                      className="w-full pr-10 pl-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#a24ec1] focus:border-[#a24ec1] text-sm transition-colors"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Results List */}
                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                  {isLoadingFinanceClients ? (
                    <div className="p-8 text-center text-gray-500">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-200 border-t-[#a24ec1] mx-auto"></div>
                      <p className="mt-2 text-xs font-medium">טוען לקוחות...</p>
                    </div>
                  ) : filteredFinanceClients.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm font-medium">
                        {searchQuery ? "לא נמצאו תוצאות" : "אין לקוחות קיימים"}
                      </p>
                      <p className="text-xs mt-1 text-gray-400">
                        {!searchQuery &&
                          "ניתן ליצור לקוחות חדשים בעמוד לקוחות (כספים)"}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {filteredFinanceClients.map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => handleSelectFinanceClient(client)}
                          className="w-full px-4 py-3 text-right hover:bg-purple-50/50 transition-colors group"
                        >
                          <div className="font-medium text-sm text-gray-900 group-hover:text-[#a24ec1] transition-colors">
                            {client.name}
                          </div>
                          {client.businessName && (
                            <div className="text-xs text-gray-500 mt-1">
                              חברה: {client.businessName}
                            </div>
                          )}
                          {client.email && (
                            <div className="text-xs text-gray-500 mt-0.5">
                              {client.email}
                            </div>
                          )}
                          {client.phone && (
                            <div className="text-xs text-gray-500 mt-0.5">
                              {client.phone}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-xs text-gray-400">
                  <span>{filteredFinanceClients.length} לקוחות</span>
                  <span className="bg-purple-100/50 text-[#a24ec1] px-1.5 py-0.5 rounded">
                    לקוחות (כספים)
                  </span>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
