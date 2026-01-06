"use client";

import type { ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type User = {
  email?: string | null;
};

export default function FeatureUsageUserSelect({
  users,
  selectedEmail,
}: {
  users: User[];
  selectedEmail: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasSelected =
    !!selectedEmail && users.some((u) => u.email && u.email === selectedEmail);

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("user_email");
    } else {
      params.set("user_email", value);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?");
  }

  return (
    <select
      className="user-select"
      aria-label="Filter by user"
      value={selectedEmail ?? "all"}
      onChange={handleChange}
    >
      <option value="all">All Users</option>
      {selectedEmail && !hasSelected && (
        <option value={selectedEmail}>{selectedEmail}</option>
      )}
      {users.map((u) => {
        const email = u.email || "";
        if (!email) return null;
        return (
          <option key={email} value={email}>
            {email}
          </option>
        );
      })}
    </select>
  );
}
