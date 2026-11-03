import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/server/user";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  return (
    <SettingsForm
      initial={{ newPerDay: user.newPerDay, level: user.level, deck: user.deck, timezone: user.timezone }}
      email={user.email}
    />
  );
}
