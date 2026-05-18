import { useState, useEffect } from 'react';
import { Settings, Plus, Trash2, Edit2, X, Check } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from 'sonner';

type PlanType = 'SUBSCRIPTION' | 'POINTS';

interface MembershipPlan {
  id: string;
  planCode: string;
  type: PlanType;
  name: string;
  priceCents: number;
  sortWeight: number;
  isRecommended: boolean;
  periodType: string;
  pointsIncluded: number;
  bonusPoints: number;
  enabled: boolean;
  description: string;
  featuresJson: string;
}

interface PlanFormData {
  planCode: string;
  type: PlanType;
  name: string;
  priceCents: number;
  sortWeight: number;
  isRecommended: boolean;
  periodType: string;
  pointsIncluded: number;
  bonusPoints: number;
  description: string;
  features: string[]; // UI helper for featuresJson
}

const DEFAULT_FORM_DATA: PlanFormData = {
  planCode: '',
  type: 'SUBSCRIPTION',
  name: '',
  priceCents: 0,
  sortWeight: 0,
  isRecommended: false,
  periodType: 'MONTHLY',
  pointsIncluded: 0,
  bonusPoints: 0,
  description: '',
  features: ['']
};

const MemberConfig = () => {
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [formData, setFormData] = useState<PlanFormData>(DEFAULT_FORM_DATA);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const data = await api.get<MembershipPlan[]>('/admin/membership/plans');
      setPlans(data);
    } catch (error) {
      console.error('Failed to fetch plans', error);
    }
  };

  const handleOpenCreate = () => {
    setEditingPlanId(null);
    setFormData(DEFAULT_FORM_DATA);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (plan: MembershipPlan) => {
    setEditingPlanId(plan.id);
    let features: string[] = [];
    try {
      const parsed = JSON.parse(plan.featuresJson || '[]');
      if (Array.isArray(parsed)) {
        features = parsed;
      } else if (typeof parsed === 'object' && parsed !== null) {
        const highlights = (parsed as { highlights?: unknown }).highlights;
        if (Array.isArray(highlights)) {
          features = highlights as string[];
        }
      }
    } catch (e) {
      features = [];
    }
    
    setFormData({
      planCode: plan.planCode,
      type: plan.type as PlanType,
      name: plan.name,
      priceCents: plan.priceCents,
      sortWeight: plan.sortWeight,
      isRecommended: plan.isRecommended,
      periodType: plan.periodType,
      pointsIncluded: plan.pointsIncluded,
      bonusPoints: plan.bonusPoints,
      description: plan.description,
      features: features.length > 0 ? features : ['']
    });
    setIsModalOpen(true);
  };

  const handleToggleEnabled = async (plan: MembershipPlan) => {
    try {
      await api.post(`/admin/membership/plans/${plan.id}/enabled?enabled=${!plan.enabled}`, {});
      toast.success(plan.enabled ? '套餐已下架' : '套餐已上架');
      fetchPlans();
    } catch (error) {
      // Error handled by api client
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        featuresJson: JSON.stringify(formData.features.filter(f => f.trim()))
      };

      if (editingPlanId !== null) {
        await api.put(`/admin/membership/plans/${editingPlanId}`, payload);
        toast.success('套餐更新成功');
      } else {
        await api.post('/admin/membership/plans', payload);
        toast.success('套餐创建成功');
      }
      setIsModalOpen(false);
      fetchPlans();
    } catch (error) {
      console.error('Submit failed', error);
    }
  };

  const updateFeature = (index: number, value: string) => {
    const newFeatures = [...formData.features];
    newFeatures[index] = value;
    setFormData({ ...formData, features: newFeatures });
  };

  const addFeature = () => {
    setFormData({ ...formData, features: [...formData.features, ''] });
  };

  const removeFeature = (index: number) => {
    const newFeatures = formData.features.filter((_, i) => i !== index);
    setFormData({ ...formData, features: newFeatures });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold font-display">会员配置</h1>
        <button 
          onClick={handleOpenCreate}
          className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> 添加套餐
        </button>
      </div>

      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
            订阅会员
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {plans.filter(p => p.type === 'SUBSCRIPTION').map((plan) => {
              let features: string[] = [];
              try {
                const parsed = JSON.parse(plan.featuresJson || '[]');
                if (Array.isArray(parsed)) {
                  features = parsed;
                } else if (typeof parsed === 'object' && parsed !== null) {
                  const highlights = (parsed as { highlights?: unknown }).highlights;
                  if (Array.isArray(highlights)) {
                    features = highlights as string[];
                  }
                }
              } catch (e) {
                features = [];
              }

              return (
                <div key={plan.id} className={`bg-card border ${plan.enabled ? 'border-white/10' : 'border-red-500/30'} rounded-xl p-6 relative group hover:border-primary/50 transition-colors`}>
                  <div className={`absolute top-0 left-0 w-full h-1 ${plan.type === 'SUBSCRIPTION' ? 'bg-blue-500' : 'bg-green-500'} rounded-t-xl opacity-50`} />
                  
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold">{plan.name}</h3>
                        {!plan.enabled && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">已下架</span>}
                      </div>
                      <p className="text-2xl font-display text-primary mt-1">
                        ¥{plan.priceCents / 100}
                        {plan.type === 'SUBSCRIPTION' && <span className="text-sm text-muted-foreground ml-1">/{plan.periodType === 'YEARLY' ? '年' : '月'}</span>}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                         <span className="text-xs bg-white/10 text-muted-foreground px-2 py-0.5 rounded">权重: {plan.sortWeight}</span>
                         {plan.isRecommended && <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">推荐</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleToggleEnabled(plan)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        title={plan.enabled ? "下架" : "上架"}
                      >
                        {plan.enabled ? <Trash2 className="h-4 w-4 text-red-400" /> : <Check className="h-4 w-4 text-green-400" />}
                      </button>
                      <button 
                        onClick={() => handleOpenEdit(plan)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      >
                        <Edit2 className="h-4 w-4 text-muted-foreground hover:text-white" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 min-h-[100px]">
                    {features.slice(0, 5).map((feature, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
                        {feature}
                      </div>
                    ))}
                    {features.length > 5 && (
                      <div className="text-xs text-muted-foreground pl-4">...还有 {features.length - 5} 项</div>
                    )}
                  </div>
                  
                  <div className="mt-4 text-xs text-muted-foreground">
                    类型: {plan.type === 'SUBSCRIPTION' ? '订阅会员' : '积分充值'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span className="w-2 h-6 bg-green-500 rounded-full"></span>
            积分充值
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {plans.filter(p => p.type === 'POINTS').map((plan) => {
              let features: string[] = [];
              try {
                const parsed = JSON.parse(plan.featuresJson || '[]');
                if (Array.isArray(parsed)) {
                  features = parsed;
                } else if (typeof parsed === 'object' && parsed !== null) {
                  const highlights = (parsed as { highlights?: unknown }).highlights;
                  if (Array.isArray(highlights)) {
                    features = highlights as string[];
                  }
                }
              } catch (e) {
                features = [];
              }

              return (
                <div key={plan.id} className={`bg-card border ${plan.enabled ? 'border-white/10' : 'border-red-500/30'} rounded-xl p-6 relative group hover:border-primary/50 transition-colors`}>
                  <div className={`absolute top-0 left-0 w-full h-1 ${plan.type === 'SUBSCRIPTION' ? 'bg-blue-500' : 'bg-green-500'} rounded-t-xl opacity-50`} />
                  
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold">{plan.name}</h3>
                        {!plan.enabled && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">已下架</span>}
                      </div>
                      <p className="text-2xl font-display text-primary mt-1">
                        ¥{plan.priceCents / 100}
                        {plan.type === 'SUBSCRIPTION' && <span className="text-sm text-muted-foreground ml-1">/{plan.periodType === 'YEARLY' ? '年' : '月'}</span>}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                         <span className="text-xs bg-white/10 text-muted-foreground px-2 py-0.5 rounded">权重: {plan.sortWeight}</span>
                         {plan.isRecommended && <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">推荐</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleToggleEnabled(plan)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        title={plan.enabled ? "下架" : "上架"}
                      >
                        {plan.enabled ? <Trash2 className="h-4 w-4 text-red-400" /> : <Check className="h-4 w-4 text-green-400" />}
                      </button>
                      <button 
                        onClick={() => handleOpenEdit(plan)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      >
                        <Edit2 className="h-4 w-4 text-muted-foreground hover:text-white" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 min-h-[100px]">
                    {features.slice(0, 5).map((feature, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
                        {feature}
                      </div>
                    ))}
                    {features.length > 5 && (
                      <div className="text-xs text-muted-foreground pl-4">...还有 {features.length - 5} 项</div>
                    )}
                  </div>
                  
                  <div className="mt-4 text-xs text-muted-foreground">
                    类型: {plan.type === 'SUBSCRIPTION' ? '订阅会员' : '积分充值'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-white/10 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-white/10">
              <h2 className="text-xl font-bold">{editingPlanId !== null ? '编辑套餐' : '新建套餐'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/10 rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">套餐编码 (Unique)</label>
                  <input 
                    required 
                    value={formData.planCode}
                    onChange={e => setFormData({...formData, planCode: e.target.value})}
                    className="w-full bg-secondary/50 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">类型</label>
                  <select 
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value as PlanType})}
                    className="w-full bg-secondary/50 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="SUBSCRIPTION">订阅会员</option>
                    <option value="POINTS">积分充值</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">名称</label>
                  <input 
                    required 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full bg-secondary/50 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">价格 (分)</label>
                  <input 
                    type="number"
                    required 
                    value={formData.priceCents}
                    onChange={e => setFormData({...formData, priceCents: parseInt(e.target.value) || 0})}
                    className="w-full bg-secondary/50 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">套餐周期</label>
                  <select 
                    value={formData.periodType}
                    onChange={e => setFormData({...formData, periodType: e.target.value})}
                    className="w-full bg-secondary/50 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="MONTHLY">月付</option>
                    <option value="YEARLY">年付</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">排序权重 (越小越靠前)</label>
                  <input 
                    type="number"
                    value={formData.sortWeight}
                    onChange={e => setFormData({...formData, sortWeight: parseInt(e.target.value) || 0})}
                    className="w-full bg-secondary/50 border border-white/10 rounded-lg px-3 py-2"
                  />
                </div>
                <div className="space-y-2 flex flex-col justify-center">
                   <label className="flex items-center gap-2 cursor-pointer mt-6">
                    <input 
                      type="checkbox"
                      checked={formData.isRecommended}
                      onChange={e => setFormData({...formData, isRecommended: e.target.checked})}
                      className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm font-medium">设为推荐</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">含积分</label>
                  <input 
                    type="number"
                    value={formData.pointsIncluded}
                    onChange={e => setFormData({...formData, pointsIncluded: parseInt(e.target.value) || 0})}
                    className="w-full bg-secondary/50 border border-white/10 rounded-lg px-3 py-2"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">赠积分</label>
                  <input 
                    type="number"
                    value={formData.bonusPoints}
                    onChange={e => setFormData({...formData, bonusPoints: parseInt(e.target.value) || 0})}
                    className="w-full bg-secondary/50 border border-white/10 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">描述</label>
                <textarea 
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full bg-secondary/50 border border-white/10 rounded-lg px-3 py-2 min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex justify-between">
                  权益列表
                  <button type="button" onClick={addFeature} className="text-primary text-xs hover:underline">+ 添加权益</button>
                </label>
                {formData.features.map((feature, index) => (
                  <div key={index} className="flex gap-2">
                    <input 
                      value={feature}
                      onChange={e => updateFeature(index, e.target.value)}
                      placeholder="例如：3000积分，30天有效期"
                      className="flex-1 bg-secondary/50 border border-white/10 rounded-lg px-3 py-2"
                    />
                    <button type="button" onClick={() => removeFeature(index)} className="p-2 text-red-400 hover:bg-white/5 rounded">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t border-white/10">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 hover:bg-white/10 rounded-lg transition-colors">
                  取消
                </button>
                <button type="submit" className="bg-primary hover:bg-primary/90 text-white px-6 py-2 rounded-lg transition-colors">
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-card border border-white/10 rounded-xl p-8 mt-8">
        <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          全局设置 (暂未对接)
        </h3>
        
        <div className="space-y-6 max-w-2xl">
          <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg">
            <div>
              <h4 className="font-medium">开放新用户注册</h4>
              <p className="text-sm text-muted-foreground">全局控制新用户注册通道</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemberConfig;
