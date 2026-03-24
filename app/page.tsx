'use client';

import { FormEvent, useState } from 'react';

type Listing = {
  id: string;
  name: string;
  price?: string;
  location?: string;
  url?: string;
};

export default function Home() {
  const [location, setLocation] = useState('San Francisco, CA');
  const [checkin, setCheckin] = useState('2026-07-01');
  const [checkout, setCheckout] = useState('2026-07-07');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, checkin, checkout, adults, children, infants }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Search failed: ${res.status} ${body}`);
      }

      const data = await res.json();
      setListings(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container">
      <h1 className="text-3xl font-bold mb-4">Airbnb Search (MCP adapter)</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={onSearch} className="lg:col-span-1 space-y-3 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
          <div>
            <label className="block text-sm font-medium">Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1 w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium">Check-in</label>
              <input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} className="mt-1 w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium">Check-out</label>
              <input type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} className="mt-1 w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium">Adults</label>
              <input type="number" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} className="mt-1 w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm"/>
            </div>
            <div>
              <label className="block text-sm font-medium">Children</label>
              <input type="number" min={0} value={children} onChange={(e) => setChildren(Number(e.target.value))} className="mt-1 w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm"/>
            </div>
            <div>
              <label className="block text-sm font-medium">Infants</label>
              <input type="number" min={0} value={infants} onChange={(e) => setInfants(Number(e.target.value))} className="mt-1 w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm"/>
            </div>
          </div>

          <button type="submit" className="w-full rounded-md bg-green-500 px-4 py-2 font-bold text-black hover:bg-green-400">{loading ? 'Searching...' : 'Search'}</button>
          {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
        </form>

        <section className="lg:col-span-2 p-4 bg-gray-900/50 rounded-lg border border-gray-700 min-h-[300px]">
          <h2 className="text-lg font-semibold mb-2">Results</h2>
          {listings.length === 0 && !loading && <p className="text-sm text-gray-400">No results yet. Enter search criteria and click search.</p>}
          <ul className="space-y-3">
            {listings.map((item) => (
              <li key={item.id} className="p-3 bg-gray-800 rounded-lg border border-gray-700">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="text-sm font-bold">{item.name}</p>
                    <p className="text-xs text-gray-400">{item.location}</p>
                  </div>
                  <span className="text-sm font-semibold text-green-300">{item.price || 'N/A'}</span>
                </div>
                <a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-300 hover:text-indigo-100">Open listing</a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
