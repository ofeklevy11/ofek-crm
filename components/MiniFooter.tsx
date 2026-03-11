import Link from "next/link";

export default function MiniFooter() {
  return (
    <footer className="w-full border-t border-border/20 py-3 text-center text-sm text-gray-800">
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
