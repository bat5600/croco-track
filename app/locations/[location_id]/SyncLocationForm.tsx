"use client";

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
  buttonClassName: string;
};

function SyncButton({
  disabled,
  buttonClassName,
}: {
  disabled?: boolean;
  buttonClassName: string;
}) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;
  return (
    <button
      type="submit"
      disabled={isDisabled}
      className={`${buttonClassName} ${
        isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
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
  buttonClassName,
}: Props) {
  const [state, formAction] = useActionState(action, { ok: null, message: null });

  return (
    <form action={formAction} className="flex flex-col items-start">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="location_id" value={locationId} />
      <SyncButton disabled={disabled} buttonClassName={buttonClassName} />
      {state.message && (
        <span
          className={`mt-1.5 text-[11px] font-medium ${
            state.ok ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {state.message}
        </span>
      )}
    </form>
  );
}
