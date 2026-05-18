import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import { Upload, X } from 'lucide-react';

interface CustomerServiceConfig {
  wechat: string;
  wechat_qrcode: string;
  email: string;
}

const SystemConfig = () => {
  const [config, setConfig] = useState<CustomerServiceConfig>({
    wechat: '',
    wechat_qrcode: '',
    email: ''
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await api.get<CustomerServiceConfig>('/admin/system-config/customer-service');
      if (data) {
        setConfig({
          wechat: data.wechat || '',
          wechat_qrcode: data.wechat_qrcode || '',
          email: data.email || ''
        });
      }
    } catch (e) {
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
      
      // 更新本地状态
      setConfig(prev => {
        const newConfig = { ...prev, wechat_qrcode: res };
        return newConfig;
      });

      // 自动保存二维码配置
      await api.post('/admin/system-config/customer-service', { wechat_qrcode: res });
      
      toast.success('二维码上传并保存成功');
    } catch (e) {
      toast.error('上传失败');
    }
  };

  const handleSave = async () => {
    try {
      await api.post('/admin/system-config/customer-service', config);
      toast.success('保存成功');
    } catch (e) {
      toast.error('保存失败');
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-display">客服配置</h1>
        <p className="text-muted-foreground mt-2">
          配置系统全局客服联系方式，将在客户端系统设置中展示
        </p>
      </div>

      <div className="max-w-2xl space-y-6 bg-card border border-white/10 rounded-xl p-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">官方微信</label>
          <input
            type="text"
            value={config.wechat || ''}
            onChange={(e) => setConfig({ ...config, wechat: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
            placeholder="请输入官方微信号，例如：VisionTech_Support"
          />
          <div className="flex items-start gap-4 mt-4">
             {config.wechat_qrcode && (
                <div className="relative w-24 h-24 bg-white/5 rounded-lg border border-white/10 overflow-hidden group">
                  <img 
                    src={config.wechat_qrcode} 
                    alt="QR Code" 
                    className="w-full h-full object-cover" 
                  />
                  <button 
                    onClick={() => {
                        setConfig({...config, wechat_qrcode: ''});
                        // 自动保存清空操作
                        api.post('/admin/system-config/customer-service', { wechat_qrcode: '' });
                    }}
                    className="absolute top-1 right-1 bg-black/50 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
             )}
             <div className="relative">
               <input 
                 type="file" 
                 accept="image/*"
                 onChange={handleFileUpload}
                 className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
               />
               <button className="bg-white/5 border border-white/10 hover:bg-white/10 text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
                 <Upload className="w-4 h-4" />
                 {config.wechat_qrcode ? '更换二维码' : '上传二维码'}
               </button>
             </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">将在客户端“官方微信”卡片悬停时展示</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">售后邮箱</label>
          <input
            type="text"
            value={config.email || ''}
            onChange={(e) => setConfig({ ...config, email: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
            placeholder="请输入售后邮箱，例如：support@vision.ai"
          />
          <p className="text-xs text-muted-foreground">将在客户端“售后邮箱”卡片中展示</p>
        </div>

        <div className="pt-4">
          <button
            onClick={handleSave}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
};

export default SystemConfig;
