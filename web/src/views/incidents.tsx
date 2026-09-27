import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, handle, INCIDENT_LABEL, INCIDENT_STATUS_LABEL, Tag, fmtTime, useToast } from '../ui';

const SEV: any = { info: ['提示', 'gray'], warn: ['预警', 'amber'], critical: ['紧急', 'red'] };

export function IncidentsView({ role }: { role: string }) {
  const toast = useToast();
  const [list, setList] = useState<any[]>([]);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const load = async () => {
    const q = new URLSearchParams();
    if (type) q.set('type', type);
    if (status) q.set('status', status);
    setList(await api('GET', `/incidents?${q.toString()}`));
  };
  useEffect(() => { load(); }, [type, status]);

  const process = async (i: any, resolved: boolean) => {
    const resolution = prompt(resolved ? '处理结果 / 闭环说明' : '接手说明', resolved ? '已处置完成' : '正在处理');
    if (resolution === null) return;
    await handle(
      api('PATCH', `/incidents/${i.id}`, { status: resolved ? 'resolved' : 'processing', resolution }),
      resolved ? '事件已闭环' : '已标记处理中',
      toast,
    );
    load();
  };
  const assignRole = async (i: any, ownerRole: string) => {
    await handle(api('PATCH', `/incidents/${i.id}`, { ownerRole }), '已转交处理角色', toast);
    load();
  };

  return (
    <div className="card">
      <h3>协同事件中心（围绕同一张票 / 同一班车贯通游客、站点、司机、调度、客服、财务）
        <span className="spacer" />
        <select style={{ width: 150 }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">全部类型</option>
          {Object.entries(INCIDENT_LABEL).map(([v, l]) => <option key={v} value={v}>{String(l)}</option>)}
        </select>
        <select style={{ width: 130, marginLeft: 8 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="open">待处理</option>
          <option value="processing">处理中</option>
          <option value="resolved">已解决</option>
        </select>
      </h3>
      <div className="table-wrap" style={{ maxHeight: 640 }}>
        <table>
          <thead><tr><th>编号</th><th>类型</th><th>级别</th><th>标题/详情</th><th>关联</th><th>责任角色</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id}>
                <td><b>{i.code}</b><div className="muted">{i.raisedBy}</div></td>
                <td>{INCIDENT_LABEL[i.type] || i.type}</td>
                <td><Tag text={SEV[i.severity]?.[0] || i.severity} tone={SEV[i.severity]?.[1] || 'gray'} /></td>
                <td style={{ maxWidth: 260 }}><b>{i.title}</b><div className="muted">{i.detail}</div>{i.resolution && <div className="muted" style={{ color: '#166534' }}>处置：{i.resolution}</div>}</td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {i.ticketId ? <div>🎫 票 #{i.ticketId}</div> : null}
                  {i.tripId ? <div>🚐 班次 #{i.tripId}</div> : null}
                  {i.stationId ? <div>📍 站 #{i.stationId}</div> : null}
                  {i.vehicleId ? <div>🚙 车 #{i.vehicleId}</div> : null}
                </td>
                <td>
                  <select value={i.ownerRole} style={{ width: 110, padding: 4 }} onChange={(e) => assignRole(i, e.target.value)}>
                    <option value="staff">站点</option>
                    <option value="dispatch">调度</option>
                    <option value="driver">司机</option>
                    <option value="cs">客服</option>
                    <option value="cs_lead">客服主管</option>
                    <option value="finance">财务</option>
                  </select>
                </td>
                <td><Badge v={i.status} map={INCIDENT_STATUS_LABEL} /></td>
                <td className="muted">{fmtTime(i.createdAt)}</td>
                <td>
                  {i.status !== 'resolved'
                    ? <div className="row" style={{ gap: 4 }}>
                        {i.status === 'open' && <button className="btn secondary sm" onClick={() => process(i, false)}>接手</button>}
                        <button className="btn sm" onClick={() => process(i, true)}>闭环</button>
                      </div>
                    : <span className="muted">已解决</span>}
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={9} className="muted">暂无事件</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted mt8">当前角色：{role}。可将事件在站点 / 调度 / 司机 / 客服 / 主管 / 财务之间转交，所有处置记录随票或班次留痕。</p>
    </div>
  );
}
