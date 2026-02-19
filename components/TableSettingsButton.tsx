"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import TableSettingsModal from "./TableSettingsModal";
import type { TabsConfig, DisplayConfig, SchemaFieldWithTab } from "@/lib/types/table-tabs";

interface TableSettingsButtonProps {
  tableId: number;
  schema: SchemaFieldWithTab[];
  tabsConfig: TabsConfig | null;
  displayConfig: DisplayConfig | null;
}

export default function TableSettingsButton({
  tableId,
  schema,
  tabsConfig,
  displayConfig,
}: TableSettingsButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        title="הגדרות טבלה"
        className="h-10 w-10"
      >
        <Settings className="h-4 w-4" />
      </Button>

      {open && (
        <TableSettingsModal
          tableId={tableId}
          schema={schema}
          tabsConfig={tabsConfig}
          displayConfig={displayConfig}
          open={open}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
