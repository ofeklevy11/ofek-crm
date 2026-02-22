"use client";

import { useState } from "react";
import Link from "next/link";
import { User, hasUserFlag } from "@/lib/permissions";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface MobileMenuProps {
  user: User | null;
}

export default function MobileMenu({ user }: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const LinkItem = ({
    href,
    children,
    onClick,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <Link
      href={href}
      className="text-lg font-medium py-3 px-4 hover:bg-muted rounded-md transition-colors text-right block"
      onClick={() => {
        setOpen(false);
        if (onClick) onClick();
      }}
    >
      {children}
    </Link>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex flex-col h-full w-[80%] sm:w-[350px]"
      >
        <div className="flex flex-col flex-1 gap-1 mt-6 overflow-y-auto no-scrollbar">
          <div className="bg-[#f4f8f8] p-3 rounded-md mb-4 text-xs text-center text-muted-foreground border border-border/50">
            <p className="font-medium text-foreground mb-1">שים לב!</p>
            <p>בתצוגת מובייל לא קיימים כל הפיצ&apos;רים הקיימים מהמחשב</p>
            <p>
              - במידה ותרצו להשתמש בכל הפיצ&apos;רים בצורה מלאה יש להשתמש במחשב.
            </p>
          </div>
          {hasUserFlag(user, "canViewDashboardData") && (
            <LinkItem href="/">לוח בקרה</LinkItem>
          )}

          {hasUserFlag(user, "canViewTables") && (
            <LinkItem href="/tables">טבלאות</LinkItem>
          )}

          {hasUserFlag(user, "canViewFinance") && (
            <LinkItem href="/finance">כספים</LinkItem>
          )}

          {hasUserFlag(user, "canViewCalendar") && (
            <LinkItem href="/calendar">יומן</LinkItem>
          )}

          {hasUserFlag(user, "canViewMeetings") && (
            <LinkItem href="/meetings">פגישות</LinkItem>
          )}

          {hasUserFlag(user, "canViewTasks") && (
            <LinkItem href="/tasks">משימות</LinkItem>
          )}

          {hasUserFlag(user, "canViewAnalytics") && (
            <LinkItem href="/analytics">
              אנליטיקה
              <span className="text-sm text-muted-foreground mr-2 font-normal">
                (צפייה בלבד)
              </span>
            </LinkItem>
          )}

          {hasUserFlag(user, "canViewUsers") && (
            <LinkItem href="/users">משתמשים</LinkItem>
          )}

          {hasUserFlag(user, "canViewGoals") && (
            <Link
              href="/finance/goals"
              className="text-lg font-medium py-3 px-4 bg-[#22c55e]/10 text-[#22c55e] hover:bg-[#22c55e]/20 rounded-md transition-colors text-right block mb-1"
              onClick={() => setOpen(false)}
            >
              תכנון יעדים
            </Link>
          )}

          {hasUserFlag(user, "canViewWhatsApp") && (
            <Link
              href="/whatsapp"
              className="text-lg font-medium py-3 px-4 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 rounded-md transition-colors text-right block mb-1"
              onClick={() => setOpen(false)}
            >
              וואטסאפ עסקי
            </Link>
          )}

          {hasUserFlag(user, "canViewChat") && (
            <Link
              href="/chat"
              className="text-lg font-medium py-3 px-4 bg-[#4f95ff]/10 text-[#4f95ff] hover:bg-[#4f95ff]/20 rounded-md transition-colors text-right block mb-1"
              onClick={() => setOpen(false)}
            >
              צ׳אט
            </Link>
          )}
        </div>

        <div className="mt-auto border-t pt-4">
          <Link
            href="/profile"
            className="flex items-center gap-3 p-2 hover:bg-muted rounded-xl transition-all"
            onClick={() => setOpen(false)}
          >
            <Avatar className="h-10 w-10 border border-border shadow-sm">
              <AvatarFallback className="bg-primary/10 text-primary font-bold">
                {user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="text-right">
              <div className="text-sm font-semibold text-foreground">
                {user.name}
              </div>
              <div className="text-xs text-muted-foreground">הגדרות פרופיל</div>
            </div>
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
