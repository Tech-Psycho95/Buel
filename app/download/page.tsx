import type { Metadata } from "next";
import { DownloadExperience } from "@/components/download-experience";

export const metadata: Metadata = {
  title: "Download BUEL Desktop — beyond the browser",
  description:
    "Download the official BUEL desktop application for Windows and macOS. Same evidence-backed intelligence workspace, same account — in a native window.",
};

export default function DownloadPage() {
  return <DownloadExperience />;
}
