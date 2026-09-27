import React, { useEffect, useRef as useReactRef, useState } from 'react';
import { api } from '../api';
import { Badge, Bar, handle, Stat, Tag, TRIP_STATUS_LABEL, useToast } from '../ui';

const WEATHER_LABEL: any = { sunny: '晴', cloudy: '多云', rain: '雨', storm: '暴雨' };

export function StationView({ ref, onChanged }: { ref: any; onChanged: () => void }) {
  const toast = useToast();
  const [stationId, setStationId] = useState<number>(ref.stations?.[0]?.id || 0);
  const [board, setBoard] = useState<any>(null);
  const [ticketCode, setTicketCode] = useState('');
  const timer = useReactRef<number | null>(null);

  const load = async () => {
    if (!stationId) return;
    try { setBoard(await api('GET', `/stations/${stationId}/board`)); } catch { /* ignore */ }
  };
  useEffect(() => { setStationId(ref.stations?.[0]?.id || 0); }, [ref.stations]);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 5000);
    timer.current = t;
    return () => window.clearInterval(t);
  }, [stationId]);

  const checkin = async () => {
    if (!ticketCode.trim()) return toast('请扫描/输入车票码', true);
    await handle(api('POST', `/stations/${stationId}/checkin`, { ticketCode: ticketCode.trim() }), '检票成功，已进入排队', toast);
    setTicketCode(''); load(); onChanged();
  };
  const boardNext = async (tripId: number, code?: string) => {
    await handle(api('POST', `/stations/${stationId}/board`, { tripId, ticketCode: code || null }), '已放行上车', toast);
    load();
  };
  const skip = async (tripId: number) => {
    await handle(api('POST', `/stations/${stationId}/skip`, { tripId }), '已登记满载跳站并广播', toast);
    load();
  };
  const dispute = async (ticketId: number) => {
    const detail = prompt('记录老人/无障碍优先争议情况', '游客对优先顺序有异议');
    if (!detail) return;
    await handle(api('POST', `/stations/${stationId}/priority-dispute`, { ticketId, detail }), '争议已登记并转客服', toast);
  };

  const s = board?.stats;
  return (
    <div>
      <div className="row mt0" style={{ marginBottom: 12 }}>
        <b style={{ fontSize: 16 }}>站点平板工作台</b>
        <select style={{ width: 200 }} value={stationId} onChange={(e) => setStationId(Number(e.target.value))}>
          {ref.stations?.map((st: any) => <option key={st.id} value={st.id}>{st.name}{st.hot ? ' 🔥' : ''}</option>)}
        </select>
        <span className="muted">每 5 秒自动刷新</span>
      </div>

      <div className="grid cols-4">
        <Stat label="当前排队" value={s?.waiting ?? '—'} sub={`其中优先 ${s?.waitingPriority ?? 0} 人`} tone={s?.crowded ? 'crit' : ''} />
        <Stat label="今日已检票" value={s?.checkedToday ?? '—'} sub={`今日已上车 ${s?.boardedToday ?? 0}`} tone="ok" />
        <Stat label="平均等待" value={`${Math.round((s?.avgWaitSec ?? 0) / 60)} 分`} sub={s?.crowded ? '超过预警，已自动上报拥堵' : '等待正常'} tone={s?.crowded ? 'warn' : ''} />
        <Stat label="天气" value={WEATHER_LABEL[board?.weather?.condition] || '—'} sub={`${board?.weather?.tempC ?? '--'}℃ ${board?.weather?.alert || ''}`} tone={board?.weather?.condition === 'storm' ? 'crit' : ''} />
      </div>

      <div className="grid cols-2 mt16">
        <div className="card">
          <h3>检票入园 <span className="spacer" /><Tag text={board?.station?.status === 'restricted' ? '限流中' : board?.station?.status === 'closed' ? '封闭' : '正常开放'} tone={board?.station?.status === 'normal' ? 'green' : 'red'} /></h3>
          <div className="row">
            <input placeholder="扫描或输入车票码（如 TDEMO0001）" value={ticketCode} onChange={(e) => setTicketCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && checkin()} />
            <button className="btn" onClick={checkin}>检票排队</button>
          </div>
          <div className="table-wrap mt16">
            <table>
              <thead><tr><th>顺序</th><th>票/游客</th><th>人数</th><th>特殊</th><th>等待</th><th></th></tr></thead>
              <tbody>
                {(board?.queue || []).map((q: any, i: number) => (
                  <tr key={q.id} style={{ background: q.priority ? '#fefce8' : undefined }}>
                    <td>{i + 1}{q.priority ? <Tag text="优先" tone="purple" /> : null}</td>
                    <td><b>{q.ticket?.code}</b><div className="muted">{q.ticket?.visitorName}</div></td>
                    <td>{q.ticket?.partySize}</td>
                    <td>{q.ticket?.stroller ? '🍼 ' : ''}{q.ticket?.hasElder ? '👴 ' : ''}{q.ticket?.hasChild ? '🧒' : ''}</td>
                    <td>{Math.round((Date.now() - new Date(q.enqueuedAt).getTime()) / 60000)} 分</td>
                    <td><button className="btn ghost sm" onClick={() => dispute(q.ticketId)}>优先争议</button></td>
                  </tr>
                ))}
                {(!board?.queue || board.queue.length === 0) && <tr><td colSpan={6} className="muted">暂无排队游客</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3>到站车辆与座位 / 轮椅余量</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>班次/线路</th><th>车辆</th><th>座位余量</th><th>轮椅位</th><th>电量</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {(board?.trips || []).map((t: any) => (
                  <tr key={t.id}>
                    <td><b>#{t.id}</b><div className="muted">方向{t.direction === 1 ? '正向' : '反向'}</div></td>
                    <td>{t.vehicle?.name}<div className="muted">{t.vehicle?.plate}</div></td>
                    <td style={{ minWidth: 120 }}><Bar pct={(t.seatsSold / t.vehicle?.seats) * 100} /><span className="muted">余 {t.seatsRemain}</span></td>
                    <td>{t.wheelchairRemain}/{t.vehicle?.wheelchairSlots}</td>
                    <td className={t.vehicle?.batteryPct < 25 ? '' : ''}>{t.vehicle?.batteryPct}%</td>
                    <td><Badge v={t.status} map={TRIP_STATUS_LABEL} /></td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn sm" disabled={t.status === 'suspended'} onClick={() => boardNext(t.id)}>放下一位</button>
                        <button className="btn amber sm" onClick={() => skip(t.id)}>满载跳站</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!board?.trips || board.trips.length === 0) && <tr><td colSpan={7} className="muted">当前没有经过本站的在途/待发班次</td></tr>}
              </tbody>
            </table>
          </div>
          <Broadcast stationId={stationId} />
        </div>
      </div>
    </div>
  );
}

function Broadcast({ stationId }: { stationId: number }) {
  const toast = useToast();
  const [content, setContent] = useState('');
  const send = async () => {
    if (!content.trim()) return;
    await handle(api('POST', `/stations/${stationId}/broadcast`, { content, channel: 'station' }), '站点广播已发布', toast);
    setContent('');
  };
  return (
    <div className="mt16">
      <h3>站点广播</h3>
      <div className="row">
        <input placeholder="如：请优先通道的老人先行，下一班约 5 分钟进站" value={content} onChange={(e) => setContent(e.target.value)} />
        <button className="btn secondary" onClick={send}>广播</button>
      </div>
    </div>
  );
}
