"use client";

import { useEffect, useState } from "react";
import { SourceSwitcher } from "./source-switcher";

export function SourceSwitcherWrapper() {
  const [driveConnected, setDriveConnected] = useState(false);

  useEffect(() => {
    fetch("/api/integrations/google/drive/status")
      .then((r) => r.json())
      .then((data) => setDriveConnected(data.connected === true))
      .catch(() => {});
  }, []);

  return <SourceSwitcher driveConnected={driveConnected} />;
}
