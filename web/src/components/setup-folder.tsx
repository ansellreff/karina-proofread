"use client";

import { useRouter } from "next/navigation";
import { FolderPicker } from "./onedrive-settings";

export function SetupFolder() {
  const router = useRouter();
  return <FolderPicker onChosen={() => router.push("/settings")} />;
}
