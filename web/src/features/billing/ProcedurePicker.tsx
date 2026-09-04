import { useMemo, useState } from 'react';
import { inr0 } from '@shared/lib/money';
import { navigate } from '@/app/router';
import { useSession } from '@/app/session';
import { Card } from '@shared/ui/primitives';
import type { Procedure } from '@shared/types';

export function ProcedurePicker({ onPick }: { onPick: (p: Procedure) => void }) {
  const { procedures, isAdmin } = useSession();
  const [search, setSearch] = useState('');
  const active = useMemo(() => procedures.filter((p) => p.active), [procedures]);
  const cats = useMemo(() => [...new Set(active.map((p) => p.cat))], [active]);
  const [cat, setCat] = useState<string | null>(null);
  const current = cat && cats.includes(cat) ? cat : cats[0];

  const s = search.trim().toLowerCase();
  const list = s ? active.filter((p) => p.name.toLowerCase().includes(s)) : active.filter((p) => p.cat === current);

  return (
    <Card className="mt">
      <div className="pad" style={{ paddingBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <b>Add treatment</b>
        <input id="procSearch" placeholder="🔍  Search any procedure…" style={{ maxWidth: 320 }}
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="pad" style={{ paddingTop: 0 }}>
        <div className="pick">
          <div className="catlist" id="catList">
            {cats.map((c) => (
              <button key={c} data-c={c} className={c === current ? 'on' : ''}
                onClick={() => { setCat(c); setSearch(''); }}>{c}</button>
            ))}
          </div>
          <div className="proclist" id="procList">
            {list.length ? list.map((p) => (
              <button key={p.id} className="pbtn" data-id={p.id} onClick={() => onPick(p)}>
                <span className="nm">{p.name}</span>
                <span className="pr">{inr0(p.price)}</span>
                <span className="fl">{p.perTooth ? 'per tooth' : 'per visit'}{s ? ' · ' + p.cat : ''}</span>
              </button>
            )) : (
              <div className="empty sm">
                No match.{' '}
                {isAdmin
                  ? <a href="#procedures" onClick={(e) => { e.preventDefault(); navigate('procedures'); }}>Add it →</a>
                  : 'Ask the admin to add it.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
