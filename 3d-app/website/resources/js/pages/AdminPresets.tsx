/**
 * Admin › Presets (task 9.148): the 3DEEZI presets everyone sees in the Studio's Preset designs. Rename, reorder, hide
 * or show, the sport and garment it shows under, delete. New ones come from the Studio's "Save as 3DEEZI preset".
 * Server: Admin\PresetAdminController.
 */
import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Layers, LoaderCircle, Pencil, Trash2 } from 'lucide-react';
import { api, media, type Catalog } from '../api';

type AdminPreset = { id: string; key: number; name: string; description: string; sport: string | null; garment: string | null; thumbnail: string | null; hidden: boolean; sort: number; design: { main?: string; secondary?: string; pattern?: string } };

export default function PresetsAdmin({ catalog, onNotice }: { catalog: Catalog | null; onNotice: (text: string) => void }) {
  const [rows, setRows] = useState<AdminPreset[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api<AdminPreset[]>('/admin/presets').then(setRows).catch(e => setError((e as Error).message)); }, []);
  useEffect(load, [load]);
  async function patch(p: AdminPreset, body: Partial<AdminPreset>, notice?: string) {
    try { const saved = await api<AdminPreset>(`/admin/presets/${p.key}`, { method: 'PATCH', body: JSON.stringify(body) }); setRows(list => (list ?? []).map(r => r.key === saved.key ? saved : r)); if (notice) onNotice(notice); }
    catch (e) { onNotice((e as Error).message); }
  }
  async function rename(p: AdminPreset) {
    const name = window.prompt('New name for this 3DEEZI preset', p.name)?.trim();
    if (name && name !== p.name) await patch(p, { name }, `Renamed to ${name}.`);
  }
  async function move(index: number, by: number) {
    if (!rows) return;
    const next = [...rows]; const [item] = next.splice(index, 1); next.splice(index + by, 0, item);
    setRows(next);
    try { setRows(await api<AdminPreset[]>('/admin/presets/order', { method: 'POST', body: JSON.stringify({ ids: next.map(r => r.key) }) })); } catch (e) { onNotice((e as Error).message); load(); }
  }
  async function remove(p: AdminPreset) {
    if (!window.confirm(`Delete the 3DEEZI preset "${p.name}"? Customers stop seeing it.`)) return;
    try { await api(`/admin/presets/${p.key}`, { method: 'DELETE' }); setRows(list => (list ?? []).filter(r => r.key !== p.key)); onNotice(`${p.name} deleted.`); } catch (e) { onNotice((e as Error).message); }
  }
  const sports = catalog?.sports ?? [];
  const garments = catalog?.garments ?? [];
  return <section className="glow-panel admin-card" data-testid="admin-presets">
    <div className="admin-toolbar"><h2><Layers size={18} /> 3DEEZI presets {rows && <small>{rows.length}</small>}</h2></div>
    <p className="muted pa-sub">Everyone sees these in the Studio’s Preset designs, in this order. Add one in the Studio with Preset designs › “Save as 3DEEZI preset”. Customers’ own presets are private and not listed here.</p>
    {error && <p className="error-message">{error}</p>}
    {!rows ? (!error && <div className="empty-state"><LoaderCircle className="spin" /></div>) : <div className="table-wrap"><table className="admin-table"><thead><tr><th>Preset</th><th>Sport</th><th>Garment</th><th>Shown</th><th /></tr></thead><tbody>
      {rows.map((p, i) => <tr key={p.key} data-preset={p.name} className={p.hidden ? 'muted' : ''}>
        <td><div className="order-kit">{p.thumbnail ? <img src={p.thumbnail} alt="" width={44} height={44} style={{ objectFit: 'cover', borderRadius: 6 }} onError={e => { (e.target as HTMLImageElement).src = media(`presets/${p.id}.webp`); }} /> : <span style={{ width: 44, height: 44, borderRadius: 6, background: `linear-gradient(135deg,${p.design.main},${p.design.secondary})` }} />}<div><strong>{p.name}</strong><small className="cell-sub">{p.description || p.design.pattern || '—'}</small></div></div></td>
        <td><select className="admin-select" aria-label={`Sport of ${p.name}`} value={p.sport ?? ''} onChange={e => void patch(p, { sport: e.target.value || null })}><option value="">Any sport</option>{sports.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}{p.sport && !sports.some(s => s.id === p.sport) && <option value={p.sport}>{p.sport}</option>}</select></td>
        <td><select className="admin-select" aria-label={`Garment of ${p.name}`} value={p.garment ?? ''} onChange={e => void patch(p, { garment: e.target.value || null })}><option value="">Any garment</option>{garments.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}{p.garment && !garments.some(g => g.id === p.garment) && <option value={p.garment}>{p.garment}</option>}</select></td>
        <td><button className="button button-secondary" onClick={() => void patch(p, { hidden: !p.hidden }, p.hidden ? `${p.name} is shown again.` : `${p.name} is hidden.`)} aria-label={p.hidden ? `Show ${p.name}` : `Hide ${p.name}`}>{p.hidden ? <><EyeOff size={14} /> Hidden</> : <><Eye size={14} /> Shown</>}</button></td>
        <td className="row-actions">
          <button className="icon-button" disabled={i === 0} onClick={() => void move(i, -1)} aria-label={`Move ${p.name} up`}><ArrowUp size={15} /></button>
          <button className="icon-button" disabled={i === rows.length - 1} onClick={() => void move(i, 1)} aria-label={`Move ${p.name} down`}><ArrowDown size={15} /></button>
          <button className="icon-button" onClick={() => void rename(p)} aria-label={`Rename ${p.name}`}><Pencil size={15} /></button>
          <button className="icon-button" onClick={() => void remove(p)} aria-label={`Delete ${p.name}`}><Trash2 size={15} /></button>
        </td>
      </tr>)}
    </tbody></table></div>}
  </section>;
}
