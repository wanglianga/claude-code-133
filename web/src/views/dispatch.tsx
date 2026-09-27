import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Bar, handle, Stat, Tag, TRIP_STATUS_LABEL, VEHICLE_STATUS_LABEL, DRIVER_STATUS_LABEL, useToast } from '../ui';

const WEATHER: Array<[string, string]> = [['sunny', '晴'], ['cloudy', '多云'], ['rain', '雨'], ['storm', '暴雨']];

export function DispatchView({ ref, onChanged }: { ref: any; onChanged: () => void }) {
  const toast = useToast();
  const [trips, setTrips] = useState<any[]>([]);
  const [report, setReport] = useState<any>(null);
  const load = async () => {
    setTrips(await api('GET', '/dispatch/trips'));
    setReport(await api('GET', '/reports/overview'));
  };
  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, []);

  const suspend = async (id: number) => {
    const reason = prompt('临时停运原因', '突降暴雨，道路临时管制');
    if (!reason) return;
    await handle(api('POST', '/dispatch/suspension', { tripIds: [id], suspended: true, reason }), '已停运并全线广播', toast);
    load();
  };
  const resume = async (id: number) => {
    await handle(api('POST', '/dispatch/suspension', { tripIds: [id], suspended: false, reason: '天气好转恢复运行' }), '已恢复运行', toast);
    load();
  };

  const active = trips.filter((t) => ['scheduled', 'boarding', 'running', 'delayed'].includes(t.status));
  return (
    <div>
      <div className="grid cols-4">
        <Stat label="在途/待发班次" value={active.length} sub={`停运 ${report?.trips.suspended ?? 0} · 累计跳站 ${report?.trips.skippedStations ?? 0}`} tone="ok" />
        <Stat label="平均车辆利用率" value={`${report?.trips.avgUtilizationPct ?? 0}%`} sub={`已完成 ${report?.trips.completed ?? 0} 班`} />
        <Stat label="待处理事件" value={report?.complaints.open ?? '—'} sub="拥堵/故障/争议等待办" tone={(report?.complaints.open ?? 0) > 0 ? 'crit' : ''} />
        <Stat label="今日退票成本" value={`¥${report?.refunds.cost ?? 0}`} sub={`退款 ${report?.refunds.refunded ?? 0} 笔 · 争议 ${report?.refunds.disputed ?? 0}`} tone="warn" />
      </div>

      <div className="grid cols-2 mt16">
        <div className="card">
          <h3>站点客流与限流</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>站点</th><th>等待</th><th>今日检票</th><th>平均等待</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {(report?.stations || []).map((s: any) => (
                  <tr key={s.id}>
                    <td>{s.name}{s.hot ? ' 🔥' : ''}</td>
                    <td><b>{s.waiting}</b></td>
                    <td>{s.checkedToday}</td>
                    <td>{Math.round(s.avgWaitSec / 60)} 分</td>
                    <td>{s.status === 'restricted' ? <Tag text="限流" tone="amber" /> : s.status === 'closed' ? <Tag text="封闭" tone="red" /> : <Tag text="正常" tone="green" />}</td>
                    <td><StationActions stationId={s.id} status={s.status} onDone={load} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <WeatherBar onDone={load} />
          <RoadControlBar ref={ref} onDone={load} />
        </div>

        <div className="card">
          <h3>车辆（电量 / 无障碍 / 故障）与司机工时</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>车辆</th><th>电量</th><th>轮椅位</th><th>状态</th><th>利用率</th><th>操作</th></tr></thead>
              <tbody>
                {(ref.vehicles || []).map((v: any) => (
                  <tr key={v.id}>
                    <td>{v.name}<div className="muted">{v.plate}</div></td>
                    <td style={{ minWidth: 110 }}><Bar pct={v.batteryPct} tone={v.batteryPct < 25 ? 'red' : v.batteryPct < 50 ? 'amber' : ''} /></td>
                    <td>{v.accessible ? `♿ ${v.wheelchairSlots}` : '—'}</td>
                    <td><Badge v={v.status} map={VEHICLE_STATUS_LABEL} /></td>
                    <td>{report?.vehicles.find((x: any) => x.id === v.id)?.utilizationPct ?? 0}%</td>
                    <td>
                      {v.status !== 'maintenance'
                        ? <button className="btn red sm" onClick={async () => { const d = prompt('故障描述', '行驶异响'); if (d) { await handle(api('POST', `/dispatch/vehicles/${v.id}/fault`, { detail: d }), '已置为故障维修', toast); load(); onChanged(); } }}>报故障</button>
                        : <button className="btn green sm" onClick={async () => { await handle(api('POST', `/dispatch/vehicles/${v.id}/repair`), '已恢复运营', toast); load(); onChanged(); }}>修复</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-wrap mt16">
            <table>
              <thead><tr><th>司机</th><th>状态</th><th>本班工时</th><th>休息</th><th>操作</th></tr></thead>
              <tbody>
                {(report?.drivers || []).map((d: any) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td><Badge v={d.status} map={DRIVER_STATUS_LABEL} /></td>
                    <td>{d.workedMinutes} 分{`（${Math.floor(d.workedMinutes / 60)}h${d.workedMinutes % 60}m）`}</td>
                    <td>{d.restMinutes} 分</td>
                    <td>
                      {d.status !== 'resting'
                        ? <button className="btn secondary sm" onClick={async () => { await handle(api('POST', `/driver/${d.id}/rest`, { resting: true }), '已安排休息 30 分钟', toast); load(); }}>安排休息</button>
                        : <button className="btn sm" onClick={async () => { await handle(api('POST', `/driver/${d.id}/rest`, { resting: false }), '已复班', toast); load(); }}>复班</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card mt16">
        <h3>班次调度（停运 / 恢复）</h3>
        <div className="table-wrap" style={{ maxHeight: 360 }}>
          <table>
            <thead><tr><th>班次</th><th>线路/方向</th><th>车辆</th><th>司机</th><th>已售票</th><th>利用率</th><th>状态</th><th>跳站</th><th>操作</th></tr></thead>
            <tbody>
              {trips.slice(0, 30).map((t) => (
                <tr key={t.id}>
                  <td><b>#{t.id}</b></td>
                  <td>{t.route?.name}<div className="muted">{t.direction === 1 ? '正向' : '反向'}</div></td>
                  <td>{t.vehicle?.name}</td>
                  <td>{t.driver?.name}</td>
                  <td>{t.seatsSold}</td>
                  <td style={{ minWidth: 100 }}><Bar pct={t.utilizationPct} /></td>
                  <td><Badge v={t.status} map={TRIP_STATUS_LABEL} /></td>
                  <td>{(t.skippedStations || []).length}</td>
                  <td>
                    {t.status !== 'suspended' && t.status !== 'completed'
                      ? <button className="btn red sm" onClick={() => suspend(t.id)}>临时停运</button>
                      : t.status === 'suspended' ? <button className="btn sm" onClick={() => resume(t.id)}>恢复</button> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StationActions({ stationId, status, onDone }: { stationId: number; status: string; onDone: () => void }) {
  const toast = useToast();
  const setStatus = async (s: string) => {
    const limit = s === 'restricted' ? prompt('限流滞留上限（人数）', '50') : undefined;
    await handle(api('POST', `/dispatch/stations/${stationId}/status`, { status: s, crowdLimit: limit ? Number(limit) : undefined }), '站点状态已更新', toast);
    onDone();
  };
  return (
    <div className="row" style={{ gap: 4 }}>
      {status !== 'restricted' && <button className="btn amber sm" onClick={() => setStatus('restricted')}>限流</button>}
      {status !== 'closed' && <button className="btn red sm" onClick={() => setStatus('closed')}>封闭</button>}
      {status !== 'normal' && <button className="btn sm" onClick={() => setStatus('normal')}>恢复</button>}
    </div>
  );
}

function WeatherBar({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [condition, setCondition] = useState('cloudy');
  const [alert, setAlert] = useState('');
  const submit = async () => {
    await handle(api('POST', '/stations/weather', { condition, tempC: 25, windLevel: condition === 'storm' ? 6 : 2, alert }), '天气已更新（暴雨将触发停运评估事件）', toast);
    onDone();
  };
  return (
    <div className="row mt16">
      <b className="muted">天气播报</b>
      <select style={{ width: 120 }} value={condition} onChange={(e) => setCondition(e.target.value)}>
        {WEATHER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <input placeholder="预警信息" value={alert} onChange={(e) => setAlert(e.target.value)} />
      <button className="btn secondary" onClick={submit}>发布天气</button>
    </div>
  );
}

function RoadControlBar({ ref, onDone }: { ref: any; onDone: () => void }) {
  const toast = useToast();
  const [stationId, setStationId] = useState<number | ''>('');
  const [suspend, setSuspend] = useState(true);
  const submit = async () => {
    const reason = prompt('道路管制原因', '前方道路临时管制，请车辆待命');
    if (reason === null) return;
    const r = await handle(
      api('POST', '/dispatch/road-control', { stationId: stationId || null, suspend, reason }),
      '道路管制已发布',
      toast,
    );
    if (r) toast(`受影响班次 ${r.affectedTripIds.length} 班${suspend ? '，已停运并广播' : '，已广播绕行'}`);
    onDone();
  };
  return (
    <div className="row mt16" style={{ borderTop: '1px dashed var(--line)', paddingTop: 12 }}>
      <b className="muted">道路管制</b>
      <select style={{ width: 150 }} value={stationId} onChange={(e) => setStationId(e.target.value ? Number(e.target.value) : '')}>
        <option value="">全线（不指定站点）</option>
        {(ref.stations || []).map((s: any) => <option key={s.id} value={s.id}>{s.name} 附近</option>)}
      </select>
      <label className="checkline"><input type="checkbox" checked={suspend} onChange={(e) => setSuspend(e.target.checked)} />同时停运受影响班次</label>
      <button className="btn amber" onClick={submit}>发布管制</button>
    </div>
  );
}

export function TripsView({ ref, onChanged }: { ref: any; onChanged: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<any>({ routeId: '', vehicleId: '', driverId: '', originStationId: '', direction: 1 });
  const [trips, setTrips] = useState<any[]>([]);
  const load = async () => setTrips(await api('GET', '/dispatch/trips'));
  useEffect(() => { load(); }, []);

  const create = async () => {
    await handle(api('POST', '/dispatch/trips', f), '派班成功（已校验电量/工时）', toast);
    load(); onChanged();
  };
  const depart = async (id: number) => { await handle(api('POST', `/dispatch/trips/${id}/depart`), '已发车（司机已完成安全检查）', toast); load(); };
  const complete = async (id: number) => { await handle(api('POST', `/dispatch/trips/${id}/complete`), '班次完成，已结算工时与利用率', toast); load(); };
  const position = async (id: number) => {
    const lat = Number(prompt('车辆纬度', '30.2705'));
    const lng = Number(prompt('车辆经度', '120.1588'));
    const batteryPct = Number(prompt('剩余电量%', '70'));
    if (Number.isNaN(lat)) return;
    await handle(api('POST', `/dispatch/trips/${id}/position`, { lat, lng, batteryPct }), '位置/电量已上报（超出电子围栏自动告警）', toast);
    load();
  };

  return (
    <div className="grid cols-2">
      <div className="card">
        <h3>安排发车（系统校验车辆电量、故障、司机工时/休息）</h3>
        <div className="grid cols-2">
          <label className="fld"><b>线路</b>
            <select value={f.routeId} onChange={(e) => setF({ ...f, routeId: Number(e.target.value) })}>
              <option value="">选择线路</option>
              {(ref.routes || []).map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="fld"><b>方向</b>
            <select value={f.direction} onChange={(e) => setF({ ...f, direction: Number(e.target.value) })}>
              <option value={1}>正向</option><option value={2}>反向</option>
            </select>
          </label>
          <label className="fld"><b>车辆</b>
            <select value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: Number(e.target.value) })}>
              <option value="">选择车辆</option>
              {(ref.vehicles || []).map((v: any) => <option key={v.id} value={v.id}>{v.name}（电量{v.batteryPct}%{v.accessible ? ' ♿' : ''}）</option>)}
            </select>
          </label>
          <label className="fld"><b>司机</b>
            <select value={f.driverId} onChange={(e) => setF({ ...f, driverId: Number(e.target.value) })}>
              <option value="">选择司机</option>
              {(ref.drivers || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}（{DRIVER_STATUS_LABEL[d.status][0]} {Math.floor(d.workedMinutes / 60)}h）</option>)}
            </select>
          </label>
          <label className="fld"><b>始发站</b>
            <select value={f.originStationId} onChange={(e) => setF({ ...f, originStationId: Number(e.target.value) })}>
              <option value="">选择始发站</option>
              {(ref.stations || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        <div className="row end"><button className="btn" onClick={create}>确认派班</button></div>
        <p className="muted mt8">低电量（&lt;25%）、故障维修、充电中车辆与休息中/超时司机将被拦截；同一司机不能同时承担两班。</p>
      </div>

      <div className="card">
        <h3>班次操作</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>班次</th><th>车辆/司机</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {trips.slice(0, 40).map((t) => (
                <tr key={t.id}>
                  <td><b>#{t.id}</b><div className="muted">{t.route?.name} · {t.direction === 1 ? '正向' : '反向'}</div></td>
                  <td>{t.vehicle?.name}<div className="muted">{t.driver?.name}</div></td>
                  <td><Badge v={t.status} map={TRIP_STATUS_LABEL} /></td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      {(t.status === 'scheduled' || t.status === 'boarding') && <button className="btn sm" onClick={() => depart(t.id)}>发车</button>}
                      {t.status === 'running' && <button className="btn blue sm" onClick={() => position(t.id)}>位置/电量</button>}
                      {(t.status === 'running' || t.status === 'boarding' || t.status === 'delayed') && <button className="btn secondary sm" onClick={() => complete(t.id)}>完成</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function CharterView({ ref, onChanged }: { ref: any; onChanged: () => void }) {
  const toast = useToast();
  const [list, setList] = useState<any[]>([]);
  const [assign, setAssign] = useState<any>({});
  const load = async () => setList(await api('GET', '/dispatch/charters'));
  useEffect(() => { load(); }, []);
  const doAssign = async (id: number) => {
    const a = assign[id] || {};
    if (!a.vehicleId || !a.driverId) return toast('请选择车辆与司机', true);
    await handle(api('POST', `/dispatch/charters/${id}/assign`, { vehicleId: a.vehicleId, driverId: a.driverId }), '包车已派车', toast);
    load(); onChanged();
  };
  return (
    <div className="card">
      <h3>团队包车派车（无障碍需求自动过滤车辆）</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>团队</th><th>人数</th><th>无障碍</th><th>报价</th><th>状态</th><th>派车</th></tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td><b>{c.groupName}</b><div className="muted">{c.contactPhone} · {c.remark}</div></td>
                <td>{c.partySize}</td>
                <td>{c.needAccessible ? <Tag text="需无障碍 ♿" tone="purple" /> : '否'}</td>
                <td>¥{c.price}</td>
                <td>{c.status === 'assigned' ? <Tag text="已派车" tone="green" /> : <Tag text="待派车" tone="amber" />}</td>
                <td>
                  {c.status === 'pending' && (
                    <div className="row" style={{ gap: 4 }}>
                      <select style={{ width: 130 }} onChange={(e) => setAssign({ ...assign, [c.id]: { ...(assign[c.id] || {}), vehicleId: Number(e.target.value) } })}>
                        <option value="">车辆</option>
                        {(ref.vehicles || []).filter((v: any) => !c.needAccessible || v.accessible).map((v: any) => <option key={v.id} value={v.id}>{v.name}({v.seats}座)</option>)}
                      </select>
                      <select style={{ width: 110 }} onChange={(e) => setAssign({ ...assign, [c.id]: { ...(assign[c.id] || {}), driverId: Number(e.target.value) } })}>
                        <option value="">司机</option>
                        {(ref.drivers || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <button className="btn sm" onClick={() => doAssign(c.id)}>派车</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="muted">暂无包车申请（游客端可提交）</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
