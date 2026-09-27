import React, { useState } from 'react';
import { api } from '../api';
import { Badge, handle, TICKET_TYPE_LABEL, TICKET_STATUS_LABEL, useToast } from '../ui';

export function VisitorView({ ref }: { ref: any }) {
  const toast = useToast();
  const [form, setForm] = useState<any>({
    type: 'single', originStationId: '', destStationId: '', partySize: 1,
    stroller: false, hasElder: false, hasChild: false, visitorName: '', phone: '', plannedRoute: '',
  });
  const [tickets, setTickets] = useState<any[]>([]);
  const [queryPhone, setQueryPhone] = useState('');
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const buy = async () => {
    if (!form.originStationId || !form.destStationId) return toast('请选择起终点站', true);
    if (!form.phone) return toast('请填写手机号便于查询车票', true);
    const t = await handle(api('POST', '/visitor/tickets', form), '购票成功', toast);
    if (t) await search(form.phone);
  };
  const search = async (phone?: string) => {
    const p = phone ?? queryPhone;
    if (!p) return toast('输入手机号查询', true);
    setTickets(await api('GET', `/visitor/tickets?phone=${encodeURIComponent(p)}`));
  };
  const refund = async (code: string) => {
    const reason = prompt('请填写退票原因', '临时停运/行程变更');
    if (!reason) return;
    await handle(api('POST', `/visitor/tickets/${code}/refund`, { reason }), '退票申请已提交，等待客服处理', toast);
    await search();
  };

  const stations = ref.stations || [];
  return (
    <div className="grid cols-2">
      <div className="card">
        <h3>购买观光车票</h3>
        <div className="grid cols-2">
          <label className="fld"><b>票种</b>
            <select value={form.type} onChange={(e) => set('type', e.target.value)}>
              <option value="single">单程票（按人 ¥20）</option>
              <option value="loop">环线票（当日多次乘坐 ¥50）</option>
              <option value="family">亲子票（含儿童 ¥45）</option>
              <option value="accessible">无障碍优先票（老人/轮椅优先 ¥25/人）</option>
            </select>
          </label>
          <label className="fld"><b>同行人数</b>
            <input type="number" min={1} value={form.partySize} onChange={(e) => set('partySize', Number(e.target.value))} />
          </label>
          <label className="fld"><b>入园 / 起点站</b>
            <select value={form.originStationId} onChange={(e) => set('originStationId', Number(e.target.value))}>
              <option value="">选择起点</option>
              {stations.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="fld"><b>终点站</b>
            <select value={form.destStationId} onChange={(e) => set('destStationId', Number(e.target.value))}>
              <option value="">选择终点（环线可选同站）</option>
              {stations.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="fld"><b>游客称呼</b><input value={form.visitorName} onChange={(e) => set('visitorName', e.target.value)} placeholder="如：张女士一家" /></label>
          <label className="fld"><b>手机号</b><input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="用于查询车票" /></label>
        </div>
        <label className="fld"><b>预计游览路线</b><input value={form.plannedRoute} onChange={(e) => set('plannedRoute', e.target.value)} placeholder="如：东门-山顶-梅园" /></label>
        <div className="row">
          <label className="checkline"><input type="checkbox" checked={form.stroller} onChange={(e) => set('stroller', e.target.checked)} />携带婴儿车</label>
          <label className="checkline"><input type="checkbox" checked={form.hasElder} onChange={(e) => set('hasElder', e.target.checked)} />同行老人（自动优先）</label>
          <label className="checkline"><input type="checkbox" checked={form.hasChild} onChange={(e) => set('hasChild', e.target.checked)} />同行儿童</label>
        </div>
        <div className="row end mt8">
          <button className="btn" onClick={buy}>确认购票</button>
        </div>
        <p className="muted mt8">购票后平台记录入园时间、起终点站、同行人数、婴儿车/老人/儿童与预计路线；无障碍票及含老人订单自动进入优先排队通道。</p>
      </div>

      <div className="card">
        <h3>我的车票 / 退票</h3>
        <div className="row">
          <input placeholder="输入购票手机号" value={queryPhone} onChange={(e) => setQueryPhone(e.target.value)} />
          <button className="btn secondary" onClick={() => search()}>查询</button>
        </div>
        <div className="table-wrap mt16">
          <table>
            <thead><tr><th>票号</th><th>票种</th><th>人数</th><th>金额</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td><b>{t.code}</b><div className="muted">{t.visitorName}</div></td>
                  <td>{TICKET_TYPE_LABEL[t.type]}</td>
                  <td>{t.partySize}{t.stroller ? ' 🍼' : ''}{t.hasElder ? ' 👴' : ''}{t.hasChild ? ' 🧒' : ''}</td>
                  <td>¥{t.price}</td>
                  <td><Badge v={t.status} map={TICKET_STATUS_LABEL} />{t.priority ? <span className="badge purple" style={{ marginLeft: 4 }}>优先</span> : null}</td>
                  <td>
                    {['issued', 'queued', 'boarded'].includes(t.status) && (
                      <button className="btn ghost sm" onClick={() => refund(t.code)}>申请退票</button>
                    )}
                    {t.status === 'refund_pending' && <span className="muted">处理中</span>}
                  </td>
                </tr>
              ))}
              {tickets.length === 0 && <tr><td colSpan={6} className="muted">购票后用手机号在此查询</td></tr>}
            </tbody>
          </table>
        </div>
        <CharterBox onDone={() => toast('包车申请已提交，调度将派车')} />
      </div>
    </div>
  );
}

function CharterBox({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<any>({ groupName: '', contactPhone: '', partySize: 15, needAccessible: false, remark: '' });
  const submit = async () => {
    if (!f.groupName || !f.contactPhone) return toast('请填写团队名与联系电话', true);
    await handle(api('POST', '/visitor/charters', f), '包车申请已提交', toast);
    setF({ groupName: '', contactPhone: '', partySize: 15, needAccessible: false, remark: '' });
    onDone();
  };
  return (
    <div className="mt16">
      <h3>团队包车</h3>
      <div className="grid cols-2">
        <label className="fld"><b>团队名称</b><input value={f.groupName} onChange={(e) => setF({ ...f, groupName: e.target.value })} /></label>
        <label className="fld"><b>联系电话</b><input value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} /></label>
        <label className="fld"><b>团队人数</b><input type="number" value={f.partySize} onChange={(e) => setF({ ...f, partySize: Number(e.target.value) })} /></label>
        <label className="fld"><b>&nbsp;</b>
          <label className="checkline"><input type="checkbox" checked={f.needAccessible} onChange={(e) => setF({ ...f, needAccessible: e.target.checked })} />需要无障碍车辆（含轮椅位）</label>
        </label>
      </div>
      <label className="fld"><b>备注</b><input value={f.remark} onChange={(e) => setF({ ...f, remark: e.target.value })} placeholder="轮椅游客数量、用车时间等" /></label>
      <div className="row end"><button className="btn secondary" onClick={submit}>提交包车需求</button></div>
    </div>
  );
}
