"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type SavedView = {
  name: string;
  qs: string;
};

const STORAGE_KEY = "croco.savedViews.locations";

function readViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch {
    return [];
  }
}

function writeViews(views: SavedView[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}

export default function SavedViews() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentQs = useMemo(() => searchParams.toString(), [searchParams]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    setViews(readViews());
  }, []);

  const saveView = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = [
      { name: trimmed, qs: currentQs },
      ...views.filter((v) => v.name !== trimmed),
    ].slice(0, 8);
    setViews(next);
    writeViews(next);
    setName("");
  };

  const deleteView = (viewName: string) => {
    const next = views.filter((v) => v.name !== viewName);
    setViews(next);
    writeViews(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Save view name..."
          className="h-9 w-40 rounded-md border border-white/10 bg-zinc-950/60 px-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/10"
        />
        <button
          type="button"
          onClick={saveView}
          className="h-9 px-3 rounded-md bg-white/10 text-xs font-semibold text-zinc-200 hover:bg-white/20 transition"
        >
          Save view
        </button>
      </div>
      {views.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {views.map((view) => (
            <div
              key={view.name}
              className="flex items-center gap-1 rounded-full border border-white/10 bg-zinc-950/60 px-3 py-1 text-xs text-zinc-300"
            >
              <button
                type="button"
                onClick={() => router.push(`/locations?${view.qs}`)}
                className="hover:text-white"
              >
                {view.name}
              </button>
              <button
                type="button"
                onClick={() => deleteView(view.name)}
                className="text-zinc-600 hover:text-zinc-300"
                aria-label={`Delete view ${view.name}`}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
