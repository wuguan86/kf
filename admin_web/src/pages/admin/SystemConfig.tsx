import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import { Upload, X } from 'lucide-react';

interface CustomerServiceConfig {
  wechat: string;
  wechat_qrcode: string;
  email: string;
}

interface WeChatChannelConfig {
  channel: 'personal' | 'enterprise';
  corpId: string;
  apiBaseUrl: string;
  secretConfigured: string;
  tokenConfigured: string;
  encodingAesKeyConfigured: string;
}

interface EnterpriseWeChatBinding {
  id?: string;
  enterpriseUserId: string;
  enterpriseUserName: string;
  userId: string;
  remark: string;
  status: 'ENABLED' | 'DISABLED';
}

const emptyBinding: EnterpriseWeChatBinding = {
  enterpriseUserId: '',
  enterpriseUserName: '',
  userId: '',
  remark: '',
  status: 'ENABLED'
};

const SystemConfig = () => {
  const [config, setConfig] = useState<CustomerServiceConfig>({ wechat: '', wechat_qrcode: '', email: '' });
  const [channelConfig, setChannelConfig] = useState<WeChatChannelConfig>({
    channel: 'personal',
    corpId: '',
    apiBaseUrl: '',
    secretConfigured: 'false',
    tokenConfigured: 'false',
    encodingAesKeyConfigured: 'false'
  });
  const [secretForm, setSecretForm] = useState({ secret: '', token: '', encodingAesKey: '' });
  const [bindings, setBindings] = useState<EnterpriseWeChatBinding[]>([]);
  const [bindingForm, setBindingForm] = useState<EnterpriseWeChatBinding>(emptyBinding);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const [customer, channel, bindingList] = await Promise.all([
        api.get<CustomerServiceConfig>('/admin/system-config/customer-service'),
        api.get<WeChatChannelConfig>('/admin/system-config/wechat-channel'),
        api.get<EnterpriseWeChatBinding[]>('/admin/enterprise-wechat/bindings')
      ]);
      setConfig({
        wechat: customer?.wechat || '',
        wechat_qrcode: customer?.wechat_qrcode || '',
        email: customer?.email || ''
      });
      setChannelConfig({
        channel: channel?.channel === 'enterprise' ? 'enterprise' : 'personal',
        corpId: channel?.corpId || '',
        apiBaseUrl: channel?.apiBaseUrl || '',
        secretConfigured: channel?.secretConfigured || 'false',
        tokenConfigured: channel?.tokenConfigured || 'false',
        encodingAesKeyConfigured: channel?.encodingAesKeyConfigured || 'false'
      });
      setBindings(bindingList || []);
    } catch {
      toast.error('加载配置失败');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post<string>('/admin/system-config/customer-service/upload-qr', formData);
      setConfig((prev) => ({ ...prev, wechat_qrcode: res }));
      await api.post('/admin/system-config/customer-service', { wechat_qrcode: res });
      toast.success('二维码上传并保存成功');
    } catch {
      toast.error('上传失败');
    }
  };

  const handleSaveCustomer = async () => {
    try {
      await api.post('/admin/system-config/customer-service', config);
      toast.success('客服配置已保存');
    } catch {
      toast.error('保存失败');
    }
  };

  const handleSaveChannel = async () => {
    try {
      await api.post('/admin/system-config/wechat-channel', {
        channel: channelConfig.channel,
        corpId: channelConfig.corpId,
        apiBaseUrl: channelConfig.apiBaseUrl,
        ...secretForm
      });
      setSecretForm({ secret: '', token: '', encodingAesKey: '' });
      toast.success('微信消息通道配置已保存');
      loadConfig();
    } catch {
      toast.error('保存通道配置失败');
    }
  };

  const handleSaveBinding = async () => {
    try {
      if (bindingForm.id) {
        await api.put(`/admin/enterprise-wechat/bindings/${bindingForm.id}`, bindingForm);
      } else {
        await api.post('/admin/enterprise-wechat/bindings', bindingForm);
      }
      setBindingForm(emptyBinding);
      toast.success('企微客服映射已保存');
      loadConfig();
    } catch {
      toast.error('保存企微客服映射失败');
    }
  };

  const handleDeleteBinding = async (id?: string) => {
    if (!id) return;
    try {
      await api.delete(`/admin/enterprise-wechat/bindings/${id}`);
      toast.success('企微客服映射已删除');
      loadConfig();
    } catch {
      toast.error('删除企微客服映射失败');
    }
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold font-display">客服配置</h1>
        <p className="text-muted-foreground mt-2">配置客户端展示的客服信息，以及个人微信/企业微信消息通道。</p>
      </div>

      <section className="max-w-3xl space-y-6 bg-card border border-white/10 rounded-xl p-6">
        <h2 className="text-lg font-semibold">客服联系方式</h2>
        <div className="space-y-2">
          <label className="text-sm font-medium">官方微信</label>
          <input value={config.wechat} onChange={(e) => setConfig({ ...config, wechat: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
            placeholder="请输入官方微信号" />
          <div className="flex items-start gap-4 mt-4">
            {config.wechat_qrcode && (
              <div className="relative w-24 h-24 bg-white/5 rounded-lg border border-white/10 overflow-hidden group">
                <img src={config.wechat_qrcode} alt="微信二维码" className="w-full h-full object-cover" />
                <button onClick={() => { setConfig({ ...config, wechat_qrcode: '' }); api.post('/admin/system-config/customer-service', { wechat_qrcode: '' }); }}
                  className="absolute top-1 right-1 bg-black/50 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            )}
            <div className="relative">
              <input type="file" accept="image/*" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <button className="bg-white/5 border border-white/10 hover:bg-white/10 text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
                <Upload className="w-4 h-4" />{config.wechat_qrcode ? '更换二维码' : '上传二维码'}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">售后邮箱</label>
          <input value={config.email} onChange={(e) => setConfig({ ...config, email: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
            placeholder="请输入售后邮箱" />
        </div>
        <button onClick={handleSaveCustomer} className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">保存客服配置</button>
      </section>

      <section className="max-w-3xl space-y-6 bg-card border border-white/10 rounded-xl p-6">
        <h2 className="text-lg font-semibold">微信消息通道</h2>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setChannelConfig({ ...channelConfig, channel: 'personal' })}
            className={`rounded-lg border px-4 py-3 text-sm ${channelConfig.channel === 'personal' ? 'border-primary bg-primary/15' : 'border-white/10 bg-white/5'}`}>
            个人微信
          </button>
          <button onClick={() => setChannelConfig({ ...channelConfig, channel: 'enterprise' })}
            className={`rounded-lg border px-4 py-3 text-sm ${channelConfig.channel === 'enterprise' ? 'border-primary bg-primary/15' : 'border-white/10 bg-white/5'}`}>
            企业微信
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="CorpID" value={channelConfig.corpId} onChange={(value) => setChannelConfig({ ...channelConfig, corpId: value })} />
          <Field label="API 地址" value={channelConfig.apiBaseUrl} onChange={(value) => setChannelConfig({ ...channelConfig, apiBaseUrl: value })} placeholder="默认 https://qyapi.weixin.qq.com" />
          <Field label={`Secret${channelConfig.secretConfigured === 'true' ? '（已配置）' : ''}`} type="password" value={secretForm.secret} onChange={(value) => setSecretForm({ ...secretForm, secret: value })} placeholder="留空则不修改" />
          <Field label={`回调 Token${channelConfig.tokenConfigured === 'true' ? '（已配置）' : ''}`} type="password" value={secretForm.token} onChange={(value) => setSecretForm({ ...secretForm, token: value })} placeholder="留空则不修改" />
          <Field label={`EncodingAESKey${channelConfig.encodingAesKeyConfigured === 'true' ? '（已配置）' : ''}`} type="password" value={secretForm.encodingAesKey} onChange={(value) => setSecretForm({ ...secretForm, encodingAesKey: value })} placeholder="留空则不修改" />
        </div>
        <button onClick={handleSaveChannel} className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">保存通道配置</button>
      </section>

      <section className="max-w-5xl space-y-6 bg-card border border-white/10 rounded-xl p-6">
        <h2 className="text-lg font-semibold">企业微信客服映射</h2>
        <div className="grid grid-cols-5 gap-3">
          <Field label="企微 userid" value={bindingForm.enterpriseUserId} onChange={(value) => setBindingForm({ ...bindingForm, enterpriseUserId: value })} />
          <Field label="企微名称" value={bindingForm.enterpriseUserName} onChange={(value) => setBindingForm({ ...bindingForm, enterpriseUserName: value })} />
          <Field label="系统用户ID" value={bindingForm.userId} onChange={(value) => setBindingForm({ ...bindingForm, userId: value })} />
          <Field label="备注" value={bindingForm.remark} onChange={(value) => setBindingForm({ ...bindingForm, remark: value })} />
          <div className="space-y-2">
            <label className="text-sm font-medium">状态</label>
            <select value={bindingForm.status} onChange={(e) => setBindingForm({ ...bindingForm, status: e.target.value as EnterpriseWeChatBinding['status'] })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm">
              <option value="ENABLED">启用</option>
              <option value="DISABLED">停用</option>
            </select>
          </div>
        </div>
        <button onClick={handleSaveBinding} className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">
          {bindingForm.id ? '更新映射' : '新增映射'}
        </button>
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground">
            <tr><th className="py-3">企微 userid</th><th>企微名称</th><th>系统用户ID</th><th>状态</th><th>备注</th><th>操作</th></tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {bindings.map((item) => (
              <tr key={item.id}>
                <td className="py-3 font-mono">{item.enterpriseUserId}</td>
                <td>{item.enterpriseUserName || '-'}</td>
                <td className="font-mono">{item.userId}</td>
                <td>{item.status === 'ENABLED' ? '启用' : '停用'}</td>
                <td>{item.remark || '-'}</td>
                <td className="space-x-3">
                  <button className="text-primary" onClick={() => setBindingForm(item)}>编辑</button>
                  <button className="text-red-400" onClick={() => handleDeleteBinding(item.id)}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
};

const Field = ({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) => (
  <div className="space-y-2">
    <label className="text-sm font-medium">{label}</label>
    <input type={type} value={value || ''} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
      placeholder={placeholder} />
  </div>
);

export default SystemConfig;
