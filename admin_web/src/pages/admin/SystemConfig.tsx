import { useEffect, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';

interface CustomerServiceConfig {
  wechat: string;
  wechat_qrcode: string;
  email: string;
}

const emptyConfig: CustomerServiceConfig = {
  wechat: '',
  wechat_qrcode: '',
  email: ''
};

const SystemConfig = () => {
  const [config, setConfig] = useState<CustomerServiceConfig>(emptyConfig);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const customer = await api.get<CustomerServiceConfig>('/admin/system-config/customer-service');
      setConfig({
        wechat: customer?.wechat || '',
        wechat_qrcode: customer?.wechat_qrcode || '',
        email: customer?.email || ''
      });
    } catch {
      toast.error('加载客服配置失败');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const url = await api.post<string>('/admin/system-config/customer-service/upload-qr', formData);
      setConfig((prev) => ({ ...prev, wechat_qrcode: url }));
      await api.post('/admin/system-config/customer-service', { wechat_qrcode: url });
      toast.success('二维码上传并保存成功');
    } catch {
      toast.error('上传二维码失败');
    }
  };

  const handleClearQrCode = async () => {
    try {
      setConfig((prev) => ({ ...prev, wechat_qrcode: '' }));
      await api.post('/admin/system-config/customer-service', { wechat_qrcode: '' });
      toast.success('二维码已清除');
    } catch {
      toast.error('清除二维码失败');
    }
  };

  const handleSaveCustomer = async () => {
    try {
      await api.post('/admin/system-config/customer-service', config);
      toast.success('客服配置已保存');
    } catch {
      toast.error('保存客服配置失败');
    }
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold font-display">客服配置</h1>
        <p className="text-muted-foreground mt-2">配置客户端展示的客服联系方式。</p>
      </div>

      <section className="max-w-3xl space-y-6 bg-card border border-white/10 rounded-xl p-6">
        <h2 className="text-lg font-semibold">客服联系方式</h2>
        <div className="space-y-2">
          <label className="text-sm font-medium">官方微信</label>
          <input
            value={config.wechat}
            onChange={(event) => setConfig({ ...config, wechat: event.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
            placeholder="请输入官方微信号"
          />
          <div className="flex items-start gap-4 mt-4">
            {config.wechat_qrcode && (
              <div className="relative w-24 h-24 bg-white/5 rounded-lg border border-white/10 overflow-hidden group">
                <img src={config.wechat_qrcode} alt="微信二维码" className="w-full h-full object-cover" />
                <button
                  onClick={handleClearQrCode}
                  className="absolute top-1 right-1 bg-black/50 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  type="button"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            )}
            <div className="relative">
              <input type="file" accept="image/*" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <button className="bg-white/5 border border-white/10 hover:bg-white/10 text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2" type="button">
                <Upload className="w-4 h-4" />
                {config.wechat_qrcode ? '更换二维码' : '上传二维码'}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">售后邮箱</label>
          <input
            value={config.email}
            onChange={(event) => setConfig({ ...config, email: event.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
            placeholder="请输入售后邮箱"
          />
        </div>
        <button onClick={handleSaveCustomer} className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-medium transition-colors" type="button">
          保存客服配置
        </button>
      </section>
    </div>
  );
};

export default SystemConfig;
