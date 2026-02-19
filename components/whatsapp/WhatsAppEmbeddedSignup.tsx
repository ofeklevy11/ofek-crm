"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Script from "next/script";
import {
  getWhatsAppAccounts,
  disconnectWhatsAppAccount,
} from "@/app/actions/whatsapp-admin";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errors";

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

interface PhoneNumber {
  id: number;
  phoneNumberId: string;
  displayPhone: string;
  verifiedName: string | null;
  qualityRating: string | null;
}

interface WhatsAppAccount {
  id: number;
  wabaId: string;
  businessName: string | null;
  status: string;
  connectedBy: string | null;
  phoneNumbers: PhoneNumber[];
  createdAt: Date;
}

export default function WhatsAppEmbeddedSignup({ nonce }: { nonce: string }) {
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [sdkError, setSdkError] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const appId = process.env.NEXT_PUBLIC_WHATSAPP_APP_ID;

  const initFB = useCallback(() => {
    if (!appId || sdkLoaded) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    window.FB.init({
      appId,
      autoLogAppEvents: true,
      xfbml: false,
      version: "v21.0",
    });
    setSdkLoaded(true);
  }, [appId, sdkLoaded]);

  // Set up fbAsyncInit fallback and timeout
  useEffect(() => {
    if (!appId) return;

    // If FB already loaded (e.g. cached), init immediately
    if (window.FB) {
      initFB();
      return;
    }

    window.fbAsyncInit = () => {
      initFB();
    };

    // Timeout: if SDK hasn't loaded within 15s, show error
    timeoutRef.current = setTimeout(() => {
      if (!sdkLoaded) setSdkError(true);
    }, 15_000);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [appId, initFB, sdkLoaded]);

  const fetchAccounts = useCallback(async () => {
    try {
      const data = await getWhatsAppAccounts();
      setAccounts(data as WhatsAppAccount[]);
    } catch {
      toast.error("שגיאה בטעינת חשבונות WhatsApp");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleConnect = () => {
    if (!sdkLoaded || !window.FB) {
      toast.error("טרם נטען חיבור פייסבוק. אנא המתינו ונסו שוב");
      return;
    }

    setConnecting(true);

    window.FB.login(
      async (response: any) => {
        if (response.authResponse?.code) {
          try {
            const res = await fetch("/api/whatsapp/embedded-signup", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Requested-With": "XMLHttpRequest",
              },
              body: JSON.stringify({ code: response.authResponse.code }),
            });

            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || "Failed to connect");
            }

            toast.success("WhatsApp חובר בהצלחה!");
            await fetchAccounts();
          } catch (error: any) {
            toast.error(getUserFriendlyError(error));
          }
        } else {
          toast.error("החיבור בוטל");
        }
        setConnecting(false);
      },
      {
        config_id: process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID || undefined,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "",
          sessionInfoVersion: 2,
        },
      },
    );
  };

  const handleDisconnect = async (accountId: number) => {
    if (!confirm("האם אתה בטוח שברצונך לנתק את חשבון ה-WhatsApp?")) return;

    try {
      await disconnectWhatsAppAccount(accountId);
      toast.success("חשבון WhatsApp נותק");
      await fetchAccounts();
    } catch {
      toast.error("שגיאה בניתוק החשבון");
    }
  };

  const activeAccounts = accounts.filter((a) => a.status === "ACTIVE");

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-gray-200 rounded w-1/3" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
            <div className="h-10 bg-gray-200 rounded w-1/4" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {appId && (
        <Script
          id="facebook-jssdk"
          src="https://connect.facebook.net/en_US/sdk.js"
          nonce={nonce}
          strategy="afterInteractive"
          onReady={() => {
            if (window.FB && !sdkLoaded) initFB();
          }}
          onError={() => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            setSdkError(true);
          }}
        />
      )}

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-6 h-6 text-green-600"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              חיבור WhatsApp Business
            </h2>
            <p className="text-sm text-gray-500">
              חבר את חשבון ה-WhatsApp Business שלך כדי לתקשר עם לקוחות
            </p>
          </div>
        </div>

        {activeAccounts.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-gray-500 mb-4">
              אין חשבון WhatsApp מחובר
            </p>
            <button
              onClick={handleConnect}
              disabled={connecting || !sdkLoaded}
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {connecting ? (
                <>
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  מתחבר...
                </>
              ) : (
                "התחבר ל-WhatsApp"
              )}
            </button>
            {!sdkLoaded && !sdkError && (
              <p className="text-xs text-gray-400 mt-2">
                טוען Facebook SDK...
              </p>
            )}
            {sdkError && (
              <p className="text-xs text-red-500 mt-2">
                שגיאה בטעינת Facebook SDK. נסה לרענן את הדף.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {activeAccounts.map((account) => (
              <div
                key={account.id}
                className="border rounded-lg p-4 bg-green-50 border-green-200"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {account.businessName || account.wabaId}
                    </h3>
                    <p className="text-xs text-gray-500">
                      WABA: {account.wabaId}
                      {account.connectedBy &&
                        ` · חובר ע"י ${account.connectedBy}`}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    <span className="w-2 h-2 bg-green-500 rounded-full" />
                    מחובר
                  </span>
                </div>

                {/* Phone numbers */}
                {account.phoneNumbers.length > 0 && (
                  <div className="space-y-2 mb-3">
                    <p className="text-xs font-medium text-gray-500">
                      מספרי טלפון:
                    </p>
                    {account.phoneNumbers.map((phone) => (
                      <div
                        key={phone.id}
                        className="flex items-center justify-between bg-white rounded px-3 py-2 text-sm"
                      >
                        <div>
                          <span className="font-mono">
                            {phone.displayPhone}
                          </span>
                          {phone.verifiedName && (
                            <span className="text-gray-500 mr-2">
                              ({phone.verifiedName})
                            </span>
                          )}
                        </div>
                        {phone.qualityRating && (
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              phone.qualityRating === "GREEN"
                                ? "bg-green-100 text-green-700"
                                : phone.qualityRating === "YELLOW"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                            }`}
                          >
                            {phone.qualityRating}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => handleDisconnect(account.id)}
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  נתק חשבון
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
