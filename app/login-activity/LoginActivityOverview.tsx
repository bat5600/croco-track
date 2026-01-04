"use client";

import { useEffect, useMemo, useState } from "react";

type ListItem = {
  key: string;
  label: string;
  href: string;
  meta?: string | null;
};

type BucketDatum = {
  key: string;
  label: string;
  count: number;
};

type ModalState = {
  title: string;
  items: ListItem[];
};

export default function LoginActivityOverview(props: {
  viewLabel: string;
  totalEntities: number;
  activePct: number;
  activeCount: number;
  powerPct: number;
  powerCount: number;
  bucketData: BucketDatum[];
  bucketItems: Record<string, ListItem[]>;
  activeItems: ListItem[];
  powerItems: ListItem[];
  last1dItems: ListItem[];
}) {
  const {
    viewLabel,
    totalEntities,
    activePct,
    activeCount,
    powerPct,
    powerCount,
    bucketData,
    bucketItems,
    activeItems,
    powerItems,
    last1dItems,
  } = props;

  const [modal, setModal] = useState<ModalState | null>(null);

  useEffect(() => {
    if (!modal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modal]);

  const bucketMax = useMemo(
    () => Math.max(1, ...bucketData.map((b) => b.count)),
    [bucketData]
  );

  function openModal(title: string, items: ListItem[]) {
    setModal({ title, items });
  }

  return (
    <>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            Total {viewLabel.toLowerCase()}
          </div>
          <div className="text-lg font-semibold text-zinc-100 mt-1">
            {totalEntities.toLocaleString()}
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            openModal(
              `Active ${viewLabel.toLowerCase()} (7d)`,
              activeItems
            )
          }
          className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-left hover:bg-white/[0.06] transition-colors"
        >
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            Active (7d)
          </div>
          <div className="text-lg font-semibold text-zinc-100 mt-1">
            {activePct}%
          </div>
          <div className="text-[11px] text-zinc-600 mt-1">
            {activeCount.toLocaleString()} active
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            openModal(
              `Power ${viewLabel.toLowerCase()}`,
              powerItems
            )
          }
          className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-left hover:bg-white/[0.06] transition-colors"
        >
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            Power {viewLabel.toLowerCase()}
          </div>
          <div className="text-lg font-semibold text-zinc-100 mt-1">
            {powerPct}%
          </div>
          <div className="text-[11px] text-zinc-600 mt-1">
            {powerCount.toLocaleString()} power
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            openModal(
              `Last login <= 1d`,
              last1dItems
            )
          }
          className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-left hover:bg-white/[0.06] transition-colors"
        >
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            Last login {"<="} 1d
          </div>
          <div className="text-lg font-semibold text-zinc-100 mt-1">
            {last1dItems.length.toLocaleString()}
          </div>
        </button>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-6 backdrop-blur-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-white tracking-tight">
              Last login buckets
            </h3>
            <span className="text-xs text-zinc-500">1 / 7 / 15 / 30 days</span>
          </div>
          <div className="flex items-end gap-3 h-48">
            {bucketData.map((b) => {
              const heightPct = Math.max(
                6,
                Math.round((b.count / bucketMax) * 100)
              );
              const items = bucketItems[b.key] || [];
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() =>
                    openModal(
                      `Last login ${b.label}`,
                      items
                    )
                  }
                  className="flex-1 flex flex-col items-center justify-end h-full group"
                >
                  <div className="text-[10px] text-zinc-500 mb-2">
                    {b.count}
                  </div>
                  <div
                    className="w-full rounded-sm transition-all duration-300"
                    style={{
                      height: `${heightPct}%`,
                      backgroundColor: b.count ? "#e4e4e7" : "#27272a",
                      opacity: b.count ? 0.9 : 0.3,
                    }}
                  />
                  <div className="text-[10px] text-zinc-600 mt-2 font-mono">
                    {b.label}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="text-xs text-zinc-500 mt-4">
            Based on last seen timestamps.
          </div>
        </div>

        <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-white tracking-tight">
                Power {viewLabel.toLowerCase()} rule
              </h3>
              <span className="text-xs text-zinc-500">7d or 28d threshold</span>
            </div>
          </div>
          <div className="text-sm text-zinc-300 space-y-2">
            <div className="flex items-center justify-between">
              <span>7 days</span>
              <span className="font-mono text-zinc-400">&gt;= 5 connections</span>
            </div>
            <div className="flex items-center justify-between">
              <span>28 days</span>
              <span className="font-mono text-zinc-400">&gt;= 20 connections</span>
            </div>
          </div>
          <div className="mt-6 text-xs text-zinc-500">
            Connections counted from tracked events.
          </div>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            onClick={() => setModal(null)}
            aria-label="Close modal"
          />
          <div
            className="relative bg-zinc-900 border border-white/10 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <div className="text-sm text-zinc-200 font-semibold">
                {modal.title}{" "}
                <span className="text-zinc-500 text-xs">
                  ({modal.items.length})
                </span>
              </div>
              <button
                type="button"
                className="text-zinc-500 hover:text-white transition-colors"
                onClick={() => setModal(null)}
                aria-label="Close"
              >
                Close
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-4 space-y-2">
              {modal.items.length === 0 && (
                <div className="text-sm text-zinc-600 italic py-8 text-center">
                  No {viewLabel.toLowerCase()} found.
                </div>
              )}
              {modal.items.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-white/[0.03] transition-colors"
                >
                  <a
                    href={item.href}
                    className="text-sm text-zinc-300 hover:text-white transition-colors truncate"
                  >
                    {item.label}
                  </a>
                  {item.meta && (
                    <div className="text-xs font-mono text-zinc-500">
                      {item.meta}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
