import "server-only";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// --- Types & Helpers ---
type EventRow = {
  id: string;
  email: string;
  url: string;
  ts: string;
};

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// Petite icône de recherche
const SearchIcon = () => (
  <svg
    className="w-4 h-4 text-zinc-500"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
    />
  </svg>
);

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const query = sp.q || "";

  // Construction de la requête Supabase
  // On se limite aux champs confirmés : id, email, url, ts
  let dbQuery = supabaseAdmin
    .from("events")
    .select("id, email, url, ts")
    .order("ts", { ascending: false })
    .limit(100);

  // Filtre si une recherche est active (sur email ou url)
  if (query) {
    dbQuery = dbQuery.or(`email.ilike.%${query}%,url.ilike.%${query}%`);
  }

  const { data, error } = await dbQuery;
  const rows = (data || []) as EventRow[];

  // --- RENDER ---
  return (
    <main className="min-h-screen bg-black text-zinc-400 font-sans p-6 md:p-10 selection:bg-zinc-800">
      <div className="max-w-[1280px] mx-auto">
        
        {/* HEADER & SEARCH */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-white/5 pb-8">
          <div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
              <span>Admin</span>
              <span className="text-zinc-700">/</span>
              <span className="text-zinc-200">Raw Logs</span>
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Events Stream</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Live feed of the last {rows.length} captured events.
            </p>
          </div>

          {/* Formulaire de recherche (Server-compatible via GET) */}
          <form className="relative w-full md:w-80">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <SearchIcon />
            </div>
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="Search by email or url..."
              className="w-full bg-zinc-900/50 border border-white/10 text-zinc-200 text-sm rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 block pl-10 p-2.5 placeholder-zinc-600 outline-none transition-all hover:bg-zinc-900"
              autoComplete="off"
            />
          </form>
        </div>

        {/* ERROR STATE */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-200 p-4 rounded-lg mb-8 text-sm font-mono">
            Error: {error.message}
          </div>
        )}

        {/* TABLE CARD */}
        <div className="bg-zinc-900/40 border border-white/5 rounded-xl backdrop-blur-sm overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-zinc-600 mb-2">No events found</div>
              {query && (
                 <div className="text-sm text-zinc-500">
                   Try adjusting your search for <span className="text-zinc-300">"{query}"</span>
                 </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-zinc-500 uppercase bg-white/[0.02] border-b border-white/5">
                  <tr>
                    <th scope="col" className="px-6 py-3 font-semibold tracking-wider w-48">Time</th>
                    <th scope="col" className="px-6 py-3 font-semibold tracking-wider w-64">User</th>
                    <th scope="col" className="px-6 py-3 font-semibold tracking-wider">URL / Resource</th>
                    <th scope="col" className="px-6 py-3 font-semibold tracking-wider text-right w-24">ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rows.map((e) => (
                    <tr key={e.id} className="hover:bg-white/[0.02] transition-colors group">
                      {/* TIMESTAMP */}
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-zinc-500">
                        {fmtDate(e.ts)}
                      </td>

                      {/* USER */}
                      <td className="px-6 py-4">
                         <div className="text-zinc-200 font-medium truncate max-w-[200px]" title={e.email}>
                            {e.email}
                         </div>
                      </td>

                      {/* URL */}
                      <td className="px-6 py-4">
                         <div className="text-xs text-zinc-400 font-mono break-all line-clamp-2" title={e.url}>
                            {e.url}
                         </div>
                      </td>

                      {/* ID */}
                      <td className="px-6 py-4 text-right text-xs text-zinc-700 font-mono group-hover:text-zinc-600">
                        {e.id.slice(0, 4)}...
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        <div className="mt-4 text-right text-xs text-zinc-600">
            Showing last {rows.length} events
        </div>

      </div>
    </main>
  );
}