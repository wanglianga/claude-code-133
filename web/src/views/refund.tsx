import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, handle, REFUND_STATUS_LABEL, TICKET_TYPE_LABEL, useToast } from '../ui';

export function RefundView({ lead, finance }: { lead: boolean; finance: boolean; staff: boolean }) {
  const toast = useToast();
  const [list, setList] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const load = async () => setList(await api('GET', filter ? `/refunds?status=${filter}` : '/refunds'));
  useEffect(() => { load(); }, [filter]);

  const act = async (id: number, body: any, msg: string) => {
    await handle(api('POST', `/refunds/${id}/${body._path}`, body), msg, toast);
    load();
  };
  const take = (id: number) => act(id, { _path: 'cs-decide', action: 'take' }, '已受理');
  const approve = (id: number) => act(id, { _path: 'cs-decide', action: 'approve' }, '已同意退款，转财务出账');
  const reject = (id: number) => {
    const note = prompt('驳回原因', '已使用且非停运责任');
    if (note === null) return;
    act(id, { _path: 'cs-decide', action: 'reject', note }, '已驳回，车票恢复有效');
  };
  const escalate = (id: number) => {
    const note = prompt('升级客服主管的争议说明', '游客对退票规则有异议');
    if (note === null) return;
    act(id, { _path: 'escalate', note }, '已升级客服主管裁决');
  };
  const supervisor = (id: number, approve: boolean) => {
    const note = prompt(approve ? '同意退款的裁决说明' : '维持驳回的裁决说明', approve ? '停运属不可抗力，全额退' : '不符合退票条件');
    if (note === null) return;
    act(id, { _path: 'supervisor', approve, note }, approve ? '主管裁决同意退款' : '主管裁决维持驳回');
  };
  const pay = (id: number) => act(id, { _path: 'pay' }, '财务已出账，退票完成');

  return (
    <div className="card">
      <h3>退票工单（游客 → 客服 → 客服主管 → 财务 围绕同一张票协同）
        <span className="spacer" />
        <select style={{ width: 170 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">全部状态</option>
          <option value="requested">待客服受理</option>
          <option value="cs_reviewing">客服处理中</option>
          <option value="escalated">主管裁决中</option>
          <option value="approved">待财务退款</option>
          <option value="refunded">已退款</option>
          <option value="rejected">已驳回</option>
        </select>
      </h3>
      <div className="table-wrap" style={{ maxHeight: 620 }}>
        <table>
          <thead><tr><th>票号/游客</th><th>票种</th><th>金额</th><th>原因</th><th>状态</th><th>处理记录</th><th>操作</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td><b>{r.ticket?.code}</b><div className="muted">{r.visitorName || r.ticket?.visitorName}</div></td>
                <td>{TICKET_TYPE_LABEL[r.ticket?.type]}</td>
                <td>¥{r.amount}</td>
                <td style={{ maxWidth: 160 }}>{r.reason}</td>
                <td><Badge v={r.status} map={REFUND_STATUS_LABEL} />{r.disputed && <div className="badge purple mt8">争议</div>}</td>
                <td className="muted" style={{ maxWidth: 240, fontSize: 12 }}>
                  {r.handledBy && <div>客服：{r.handledBy}</div>}
                  {r.supervisorBy && <div>主管：{r.supervisorBy}</div>}
                  {r.financeBy && <div>财务：{r.financeBy}</div>}
                  {r.disputeNote && <div style={{ marginTop: 4 }}>{r.disputeNote}</div>}
                </td>
                <td>
                  <div className="row" style={{ gap: 4 }}>
                    {r.status === 'requested' && !finance && <button className="btn sm" onClick={() => take(r.id)}>受理</button>}
                    {(r.status === 'requested' || r.status === 'cs_reviewing') && !lead && !finance && (
                      <>
                        <button className="btn sm" onClick={() => approve(r.id)}>同意退款</button>
                        <button className="btn red sm" onClick={() => reject(r.id)}>驳回</button>
                        <button className="btn amber sm" onClick={() => escalate(r.id)}>争议升级</button>
                      </>
                    )}
                    {r.status === 'escalated' && lead && (
                      <>
                        <button className="btn sm" onClick={() => supervisor(r.id, true)}>裁决同意</button>
                        <button className="btn red sm" onClick={() => supervisor(r.id, false)}>维持驳回</button>
                      </>
                    )}
                    {r.status === 'approved' && finance && <button className="btn sm" onClick={() => pay(r.id)}>财务退款出账</button>}
                    {(r.status === 'refunded' || r.status === 'rejected') && <span className="muted">已闭环</span>}
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="muted">暂无退票工单（游客端可对车票发起退票）</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
