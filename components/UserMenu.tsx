"use client";

import { useState, useRef, useEffect } from "react";
import { User } from "@/lib/permissions";
import Link from "next/link";

interface UserMenuProps {
  user: User | null;
}

export default function UserMenu({ user }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  if (!user) {
    return null;
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "admin":
        return "אדמין";
      case "manager":
        return "מנהל";
      case "basic":
        return "משתמש";
      default:
        return role;
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 hover:bg-gray-50 p-2 rounded-lg transition-colors focus:outline-none"
      >
        <div className="text-right hidden sm:block">
          <div className="text-sm font-medium text-gray-900">{user.name}</div>
          <div className="text-xs text-gray-500">{getRoleLabel(user.role)}</div>
        </div>
        <div className="h-9 w-9 rounded-full bg-linear-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-sm">
          {user.name.charAt(0).toUpperCase()}
        </div>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50 origin-top-left animate-in fade-in zoom-in-95 duration-100">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <p className="text-sm font-medium text-gray-900">מחובר כ-</p>
            <p className="text-sm text-gray-500 truncate">{user.email}</p>
          </div>

          <div className="py-1">
            <div className="px-4 py-2">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                פרטי פרופיל
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">תפקיד:</span>
                  <span className="font-medium text-gray-900">
                    {getRoleLabel(user.role)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">מזהה:</span>
                  <span className="font-medium text-gray-900">#{user.id}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 py-1">
            <button
              className="w-full text-right px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              onClick={async () => {
                try {
                  await fetch("/api/auth/logout", {
                    method: "POST",
                  });
                  window.location.href = "/login";
                } catch (error) {
                  console.error("Logout failed", error);
                }
              }}
            >
              התנתק
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
