import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { Loader2, Plus, Edit2, Trash2, Search, RotateCw, Ticket, Copy, X } from 'lucide-react';
import { toast } from 'sonner';

interface InvitationCode {
  id: string;
  code: string;
  type: number; // 1-Member, 2-Points
  planId?: string;
  duration?: number;
  durationUnit?: string;
  points?: number;
  totalCount: number;
  usedCount: number;
  channel: string;
  startTime: string;
  endTime: string;
  createdAt: string;
}

interface MembershipPlan {
  id: string;
  name: string;
  type: string;
  periodType?: string;
}

interface PageResult<T> {
  records: T[];
  total: number;
  size: number;
  current: number;
  pages: number;
}

const InvitationCodes = () => {
  const [codes, setCodes] = useState<InvitationCode[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(1);
  const size = 10;
  
  // Filters
  const [searchCode, setSearchCode] = useState('');
  const [searchChannel, setSearchChannel] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentCode, setCurrentCode] = useState(''); // For display in edit mode

  // Form
  const [formData, setFormData] = useState({
    count: 1,
    type: 1,
    planId: '',
    duration: 1,
    durationUnit: 'Month',
    points: 100,
    totalCount: 1,
    channel: '',
    startTime: '',
    endTime: ''
  });

  useEffect(() => {
    fetchPlans();
    // Set default dates
    const now = new Date();
    const nextYear = new Date();
    nextYear.setFullYear(now.getFullYear() + 1);
    
    setFormData(prev => ({
      ...prev,
      startTime: formatDateInput(now),
      endTime: formatDateInput(nextYear)
    }));
  }, []);

  useEffect(() => {
    fetchCodes();
  }, [current, size]);

  const formatDateInput = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const fetchPlans = async () => {
    try {
      const data = await api.get<MembershipPlan[]>('/admin/membership/plans');
      // Only show subscription plans, not points recharge
      const subscriptionPlans = (data || []).filter(p => p.type === 'SUBSCRIPTION');
      setPlans(subscriptionPlans);
      if (subscriptionPlans.length > 0) {
        setFormData(prev => ({ ...prev, planId: subscriptionPlans[0].id }));
      }
    } catch (error) {
      console.error('Failed to fetch plans', error);
    }
  };

  const fetchCodes = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        current: current.toString(),
        size: size.toString(),
      });
      if (searchCode) params.append('code', searchCode);
      if (searchChannel) params.append('channel', searchChannel);

      const data = await api.get<PageResult<InvitationCode>>(`/admin/invitation-codes?${params}`);
      if (data) {
        setCodes(data.records);
        setTotal(data.total);
      }
    } catch (error) {
      console.error('Failed to fetch codes', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setCurrent(1);
    fetchCodes();
  };

  const handleOpenCreate = () => {
    setIsEdit(false);
    setCurrentId(null);
    setCurrentCode('');
    const now = new Date();
    const nextYear = new Date();
    nextYear.setFullYear(now.getFullYear() + 1);

    setFormData({
      count: 1,
      type: 1,
      planId: plans.length > 0 ? plans[0].id : '',
      duration: 1,
      durationUnit: 'Month',
      points: 100,
      totalCount: 1,
      channel: '',
      startTime: formatDateInput(now),
      endTime: formatDateInput(nextYear)
    });
    setShowModal(true);
  };

  const handleOpenEdit = (item: InvitationCode) => {
    setIsEdit(true);
    setCurrentId(item.id);
    setCurrentCode(item.code);
    setFormData({
      count: 1, // Not used in edit
      type: item.type,
      planId: item.planId || (plans.length > 0 ? plans[0].id : ''),
      duration: item.duration || 1,
      durationUnit: item.durationUnit || 'Month',
      points: item.points || 100,
      totalCount: item.totalCount,
      channel: item.channel || '',
      startTime: item.startTime ? item.startTime.split('T')[0] : '',
      endTime: item.endTime ? item.endTime.split('T')[0] : ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除该邀请码吗？')) return;
    try {
      await api.delete(`/admin/invitation-codes/${id}`);
      toast.success('删除成功');
      fetchCodes();
    } catch (error) {
      // Error handled by api
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let durationUnit = formData.durationUnit;
      if (formData.type === 1) {
        const selectedPlan = plans.find(p => p.id === formData.planId);
        if (selectedPlan) {
          if (selectedPlan.periodType === 'MONTHLY') durationUnit = 'Month';
          else if (selectedPlan.periodType === 'YEARLY') durationUnit = 'Year';
          else if (selectedPlan.periodType === 'PERMANENT') durationUnit = 'Day';
        }
      }

      const payload = {
        ...formData,
        durationUnit,
        startTime: formData.startTime ? new Date(formData.startTime).toISOString() : null,
        endTime: formData.endTime ? new Date(formData.endTime).toISOString() : null
      };

      if (isEdit && currentId) {
        await api.put(`/admin/invitation-codes/${currentId}`, payload);
        toast.success('更新成功');
      } else {
        await api.post('/admin/invitation-codes', payload);
        toast.success('生成成功');
      }
      setShowModal(false);
      fetchCodes();
    } catch (error) {
      // Error handled by api
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('已复制');
  };

  const getPlanName = (id?: string) => {
    if (!id) return '';
    const plan = plans.find(p => p.id === id);
    if (!plan) return '未知套餐';
    const periodLabel = plan.periodType === 'MONTHLY' ? '月度' : plan.periodType === 'YEARLY' ? '年度' : plan.periodType === 'PERMANENT' ? '永久' : '';
    return periodLabel ? `${plan.name}（${periodLabel}）` : plan.name;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold font-display flex items-center gap-3">
          <Ticket className="h-8 w-8 text-primary" />
          邀请码管理
        </h1>
        <button 
          onClick={handleOpenCreate}
          className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          生成邀请码
        </button>
      </div>

      {/* Filters */}
      <div className="bg-card border border-white/10 p-4 rounded-xl flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">邀请码</label>
          <input
            type="text"
            value={searchCode}
            onChange={(e) => setSearchCode(e.target.value)}
            placeholder="输入邀请码"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary w-48"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">渠道</label>
          <input
            type="text"
            value={searchChannel}
            onChange={(e) => setSearchChannel(e.target.value)}
            placeholder="输入渠道"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary w-48"
          />
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleSearch}
            className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 h-[38px]"
          >
            <Search className="h-4 w-4" />
            查询
          </button>
          <button 
            onClick={() => {
                setSearchCode('');
                setSearchChannel('');
            }}
            className="bg-secondary hover:bg-secondary/80 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border border-white/10 h-[38px]"
          >
            <RotateCw className="h-4 w-4" />
            重置
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white/5 text-muted-foreground">
              <tr>
                <th className="px-6 py-4 font-medium whitespace-nowrap">邀请码</th>
                <th className="px-6 py-4 font-medium whitespace-nowrap">渠道</th>
                <th className="px-6 py-4 font-medium whitespace-nowrap">权益内容</th>
                <th className="px-6 py-4 font-medium whitespace-nowrap">已用/上限</th>
                <th className="px-6 py-4 font-medium whitespace-nowrap">有效期</th>
                <th className="px-6 py-4 font-medium whitespace-nowrap">创建时间</th>
                <th className="px-6 py-4 font-medium whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    加载中...
                  </td>
                </tr>
              ) : codes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">
                    暂无数据
                  </td>
                </tr>
              ) : (
                codes.map((item) => (
                  <tr key={item.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-medium font-mono flex items-center gap-2">
                      {item.code}
                      <button onClick={() => copyToClipboard(item.code)} className="text-muted-foreground hover:text-white">
                        <Copy className="h-3 w-3" />
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm">{item.channel || '默认渠道'}</td>
                    <td className="px-6 py-4 text-sm">
                      {item.type === 1 ? (
                        <span className="text-blue-400 font-medium">
                          {getPlanName(item.planId)} · {item.duration}{item.durationUnit === 'Month' ? '个月' : item.durationUnit === 'Year' ? '年' : '天'}
                        </span>
                      ) : (
                        <span className="text-orange-400 font-medium">
                          {item.points} 积分
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {item.usedCount}/{item.totalCount}
                    </td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">
                      <div>起：{item.startTime ? item.startTime.split('T')[0] : '-'}</div>
                      <div>止：{item.endTime ? item.endTime.split('T')[0] : '-'}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {item.createdAt ? item.createdAt.split('T')[0] : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleOpenEdit(item)} className="p-1 hover:bg-white/10 rounded text-blue-400 transition-colors">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="p-1 hover:bg-white/10 rounded text-red-400 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="p-4 border-t border-white/10 flex justify-between items-center text-sm text-muted-foreground">
          <div>共 {total} 条记录，当前第 {current} / {Math.ceil(total / size) || 1} 页</div>
          <div className="flex gap-2">
            <button 
              disabled={current <= 1}
              onClick={() => setCurrent(prev => prev - 1)}
              className="px-3 py-1 bg-white/5 rounded hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              上一页
            </button>
            <button 
              disabled={current >= (Math.ceil(total / size) || 1)}
              onClick={() => setCurrent(prev => prev + 1)}
              className="px-3 py-1 bg-white/5 rounded hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card border border-white/10 rounded-xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">{isEdit ? '编辑邀请码' : '生成邀请码'}</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {isEdit && (
                 <div className="space-y-1.5">
                   <label className="text-sm font-medium text-muted-foreground">邀请码</label>
                   <input
                     type="text"
                     value={currentCode}
                     disabled
                     className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm opacity-50 cursor-not-allowed"
                   />
                 </div>
              )}

              {!isEdit && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">生成数量 (个)</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.count}
                    onChange={(e) => setFormData({...formData, count: parseInt(e.target.value) || 1})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">邀请码类型</label>
                {isEdit ? (
                    <div className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm opacity-50">
                        {formData.type === 1 ? '会员 (赠送权益)' : '普通 (赠送积分)'}
                    </div>
                ) : (
                    <select
                        value={formData.type}
                        onChange={(e) => setFormData({...formData, type: parseInt(e.target.value)})}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                      >
                        <option value={1} className="bg-gray-800 text-white">会员 (赠送权益)</option>
                        <option value={2} className="bg-gray-800 text-white">普通 (赠送积分)</option>
                      </select>
                )}
              </div>

              {formData.type === 1 ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground">会员套餐</label>
                    <select
                      value={formData.planId}
                      onChange={(e) => setFormData({...formData, planId: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    >
                      {plans.map(plan => {
                        const periodLabel = plan.periodType === 'MONTHLY' ? '月度' : plan.periodType === 'YEARLY' ? '年度' : plan.periodType === 'PERMANENT' ? '永久' : '';
                        const label = periodLabel ? `${plan.name}（${periodLabel}）` : plan.name;
                        return (
                          <option key={plan.id} value={plan.id} className="bg-gray-800 text-white">{label}</option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground">时长</label>
                    <input
                      type="number"
                      min="1"
                      value={formData.duration}
                      onChange={(e) => setFormData({...formData, duration: parseInt(e.target.value) || 1})}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">单个赠送积分</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.points}
                    onChange={(e) => setFormData({...formData, points: parseInt(e.target.value) || 0})}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground">使用次数限制</label>
                    <input
                        type="number"
                        min="1"
                        value={formData.totalCount}
                        onChange={(e) => setFormData({...formData, totalCount: parseInt(e.target.value) || 1})}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground">使用渠道</label>
                    <input
                        type="text"
                        value={formData.channel}
                        onChange={(e) => setFormData({...formData, channel: e.target.value})}
                        placeholder="例如：线下推广"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground">开始时间</label>
                    <input
                        type="date"
                        value={formData.startTime}
                        onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground">结束时间</label>
                    <input
                        type="date"
                        value={formData.endTime}
                        onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-white py-2 rounded-lg font-medium transition-colors mt-6"
              >
                {isEdit ? '保存修改' : '确认生成'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvitationCodes;
