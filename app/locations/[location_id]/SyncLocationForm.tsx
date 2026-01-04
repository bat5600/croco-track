"use client";

import type { CSSProperties } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

type SyncState = {
  ok: boolean | null;
  message: string | null;
};

type Props = {
  action: (prevState: SyncState, formData: FormData) => Promise<SyncState>;
  companyId: string;
  locationId: string;
  disabled?: boolean;
  buttonStyle: CSSProperties;
};

function SyncButton({ disabled, buttonStyle }: { disabled?: boolean; buttonStyle: CSSProperties }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      style={{
        ...buttonStyle,
        opacity: disabled || pending ? 0.5 : 1,
        cursor: disabled || pending ? "not-allowed" : "pointer",
      }}
    >
      {pending ? "Syncing..." : "Sync location"}
    </button>
  );
}

export default function SyncLocationForm({
  action,
  companyId,
  locationId,
  disabled,
  buttonStyle,
}: Props) {
  const [state, formAction] = useActionState(action, { ok: null, message: null });

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="location_id" value={locationId} />
      <SyncButton disabled={disabled} buttonStyle={buttonStyle} />
      {state.message && (
        <span
          style={{
            marginTop: "6px",
            fontSize: "11px",
            color: state.ok ? "#34d399" : "#f87171",
            fontWeight: 500,
          }}
        >
          {state.message}
        </span>
      )}
    </form>
  );
}
