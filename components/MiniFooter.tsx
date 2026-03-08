import Link from "next/link";

export default function MiniFooter() {
  return (
    <footer className="w-full border-t border-border/20 py-3 text-center text-xs text-muted-foreground/50">
      <div className="flex items-center justify-center gap-3">
        <Link href="/terms" prefetch={false} className="hover:text-muted-foreground transition-colors">
          תנאי שימוש
        </Link>
        <span>|</span>
        <Link href="/privacy" prefetch={false} className="hover:text-muted-foreground transition-colors">
          מדיניות פרטיות
        </Link>
        <span>|</span>
        <span>&copy; {new Date().getFullYear()} BizlyCRM</span>
      </div>
    </footer>
  );
}
