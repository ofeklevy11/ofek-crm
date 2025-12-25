"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useDebouncedCallback } from "use-debounce";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function SearchInput() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const replace = useRouter().replace;

  const handleSearch = useDebouncedCallback((term: string) => {
    const params = new URLSearchParams(searchParams);
    if (term) {
      params.set("q", term);
    } else {
      params.delete("q");
    }
    replace(`${pathname}?${params.toString()}`);
  }, 300);

  return (
    <div className="relative">
      <Input
        type="text"
        placeholder="חיפוש..."
        onChange={(e) => handleSearch(e.target.value)}
        defaultValue={searchParams.get("q")?.toString()}
        className="pl-10 h-10 w-full sm:w-64"
      />
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
        <Search className="h-4 w-4" />
      </div>
    </div>
  );
}
