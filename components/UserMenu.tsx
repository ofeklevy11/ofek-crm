"use client";

import { User } from "@/lib/permissions";
import Link from "next/link";

interface UserMenuProps {
  user: User | null;
}

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, User as UserIcon, BadgeCheck, Settings } from "lucide-react";

export default function UserMenu({ user }: UserMenuProps) {
  if (!user) return null;

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
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-3 hover:bg-muted/50 p-2 rounded-xl transition-all outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-semibold text-foreground">
              {user.name}
            </div>
            <div className="text-xs text-muted-foreground">
              {getRoleLabel(user.role)}
            </div>
          </div>
          <Avatar className="h-9 w-9 border border-border shadow-sm">
            <AvatarFallback className="bg-primary/10 text-primary font-bold">
              {user.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.company && (
          <>
            <div className="px-2 py-1.5 text-sm text-muted-foreground bg-muted/30 mx-1 rounded-md mb-1">
              <span className="text-xs block mb-0.5">ארגון:</span>
              <span className="font-medium text-foreground">
                {user.company.name}
              </span>
            </div>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem asChild>
          <Link
            href="/profile"
            className="cursor-pointer gap-2 w-full flex items-center"
          >
            <Settings className="w-4 h-4" />
            <span>פרופיל הגדרות</span>
          </Link>
        </DropdownMenuItem>

        <div className="p-2 space-y-1">
          <div className="flex justify-between items-center px-2 py-1.5 text-sm">
            <span className="text-muted-foreground flex items-center gap-2">
              <BadgeCheck className="w-4 h-4" />
              תפקיד
            </span>
            <span className="font-medium">{getRoleLabel(user.role)}</span>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive cursor-pointer gap-2"
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
          <LogOut className="w-4 h-4" />
          <span>התנתק</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
