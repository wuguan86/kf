import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../../lib/api';

type PaymentMethodKey = 'wechat' | 'alipay' | 'bank';

interface PaymentMethod {
  key: PaymentMethodKey;
  name: string;
  description: string;
  enabled: boolean;
  status: string;
}

interface WechatConfig {
  appId: string;
  merchantId: string;
  apiV3Key: string;
  certificateSerialNo: string;
  platformPublicId: string;
  platformPublicPem: string;
  notifyUrl: string;
  apiCertPem: string;
  apiKeyPem: string;
}

interface AlipayConfig {
  appId: string;
  signType: string;
  gatewayUrl: string;
  notifyUrl: string;
  appPrivateKey: string;
  alipayPublicKey: string;
  appCert: string;
  alipayRootCert: string;
}

interface BankConfig {
  bankName: string;
  accountNo: string;
  accountName: string;
}

const Payment = () => {
  const [methods, setMethods] = useState<PaymentMethod[]>([
    { key: 'wechat', name: '微信支付', description: '为用户提供微信扫码及公众号支付能力', enabled: true, status: '正常' },
    { key: 'alipay', name: '支付宝支付', description: '支持支付宝网页与移动端支付', enabled: true, status: '正常' },
    { key: 'bank', name: '对公转账', description: '为企业客户提供线下转账能力', enabled: true, status: '正常' }
  ]);

  const [activeMethod, setActiveMethod] = useState<PaymentMethodKey | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [wechatConfig, setWechatConfig] = useState<WechatConfig>({
    appId: 'wx16985beb9c363556',
    merchantId: '1338020601',
    apiV3Key: '**************',
    certificateSerialNo: '7232AEE4CC5C31494',
    platformPublicId: 'PUB_KEY_ID_01133802',
    platformPublicPem: '-----BEGIN PUBLIC KEY-----',
    notifyUrl: 'https://www.toutouyimei.com/api/app/recharge/callback',
    apiCertPem: '-----BEGIN CERTIFICATE-----',
    apiKeyPem: '-----BEGIN PRIVATE KEY-----'
  });

  const [alipayConfig, setAlipayConfig] = useState<AlipayConfig>({
    appId: '2021006121648202',
    signType: 'RSA2',
    gatewayUrl: 'https://openapi.alipay.com/gateway.do',
    notifyUrl: 'https://www.toutouyimei.com/api/app/recharge/callback',
    appPrivateKey: 'MIIE********',
    alipayPublicKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A',
    appCert: 'MIIDd********',
    alipayRootCert: '-----BEGIN CERTIFICATE-----'
  });

  const [bankConfig, setBankConfig] = useState<BankConfig>({
    bankName: '建设银行成都华府西苑支行',
    accountNo: '5105 0142 6293 0000 0064',
    accountName: '成都美送科技有限公司'
  });

  const activeMethodLabel = useMemo(() => {
    if (!activeMethod) return '';
    return methods.find((item) => item.key === activeMethod)?.name ?? '';
  }, [activeMethod, methods]);

  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const list = await api.get<Array<{ method: string; enabled: boolean; configJson: string }>>('/admin/payment/config');
        const map = new Map<string, { enabled: boolean; json: Record<string, string> }>();
        list.forEach((row) => {
          let parsed: Record<string, string> = {};
          try {
            parsed = JSON.parse(row.configJson || '{}') as Record<string, string>;
          } catch (e) {
            void e;
          }
          map.set(row.method.toUpperCase(), { enabled: !!row.enabled, json: parsed });
        });
        setMethods((prev) =>
          prev.map((m) => {
            const found = map.get(m.key.toUpperCase());
            return found ? { ...m, enabled: found.enabled } : m;
          })
        );
        const w = map.get('WECHAT')?.json;
        if (w) setWechatConfig((c) => ({ ...c, ...w }));
        const a = map.get('ALIPAY')?.json;
        if (a) setAlipayConfig((c) => ({ ...c, ...a }));
        const b = map.get('BANK')?.json;
        if (b) setBankConfig((c) => ({ ...c, ...b }));
      } catch (e) {
        void e;
      }
    };
    fetchConfigs();
  }, []);

  const toggleMethod = async (key: PaymentMethodKey) => {
    setMethods((prev) => prev.map((item) => (item.key === key ? { ...item, enabled: !item.enabled } : item)));
    try {
      const enabled = !methods.find((m) => m.key === key)?.enabled;
      const payload = { enabled, configJson: JSON.stringify(buildConfigPayload(key)) };
      await api.put(`/admin/payment/config/${key.toUpperCase()}`, payload);
    } catch (e) {
      void e;
      setMethods((prev) => prev.map((item) => (item.key === key ? { ...item, enabled: !item.enabled } : item)));
    }
  };

  const openConfig = (key: PaymentMethodKey) => {
    setActiveMethod(key);
    setIsModalOpen(true);
  };

  const closeConfig = () => {
    setIsModalOpen(false);
  };

  const buildConfigPayload = (key: PaymentMethodKey) => {
    if (key === 'wechat') return wechatConfig;
    if (key === 'alipay') return alipayConfig;
    return bankConfig;
  };

  const handleSaveConfig = async () => {
    if (!activeMethod) {
      setIsModalOpen(false);
      return;
    }
    try {
      const enabled = methods.find((m) => m.key === activeMethod)?.enabled ?? true;
      const payload = { enabled, configJson: JSON.stringify(buildConfigPayload(activeMethod)) };
      await api.put(`/admin/payment/config/${activeMethod.toUpperCase()}`, payload);
      setIsModalOpen(false);
    } catch (e) {
      void e;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-display">支付管理</h1>
        <p className="text-sm text-muted-foreground mt-2">统一管理微信、支付宝及对公转账的支付参数</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {methods.map((item) => (
          <div key={item.key} className="bg-card border border-white/10 rounded-xl p-6 flex flex-col gap-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{item.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={item.enabled}
                  onChange={() => toggleMethod(item.key)}
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-gray-600 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
              </label>
            </div>

            <div className="flex items-center justify-between">
              <span
                className={`px-2.5 py-1 rounded-full text-xs border ${
                  item.enabled ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20'
                }`}
              >
                {item.enabled ? '正常' : '已停用'}
              </span>
              <button
                onClick={() => openConfig(item.key)}
                className="text-sm text-primary hover:text-primary/80 bg-primary/10 px-3 py-1.5 rounded-lg"
              >
                配置参数
              </button>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-xl font-bold">配置{activeMethodLabel}</h2>
              <button onClick={closeConfig} className="p-2 hover:bg-white/10 rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-primary/10 border border-primary/20 text-primary text-sm px-4 py-3 rounded-lg">
                请直接粘贴证书内容或密钥字符串，无需上传文件。
              </div>

              {activeMethod === 'wechat' && (
                <div className="grid grid-cols-2 gap-4">
                  <FieldInput label="APPID" value={wechatConfig.appId} onChange={(value) => setWechatConfig((prev) => ({ ...prev, appId: value }))} />
                  <FieldInput label="商户号 (mchId)" value={wechatConfig.merchantId} onChange={(value) => setWechatConfig((prev) => ({ ...prev, merchantId: value }))} />
                  <FieldInput label="API V3密钥" type="password" value={wechatConfig.apiV3Key} onChange={(value) => setWechatConfig((prev) => ({ ...prev, apiV3Key: value }))} />
                  <FieldInput label="证书序列号" value={wechatConfig.certificateSerialNo} onChange={(value) => setWechatConfig((prev) => ({ ...prev, certificateSerialNo: value }))} />
                  <FieldInput label="平台公钥ID" value={wechatConfig.platformPublicId} onChange={(value) => setWechatConfig((prev) => ({ ...prev, platformPublicId: value }))} />
                  <FieldTextarea label="平台公钥 (PEM)" value={wechatConfig.platformPublicPem} onChange={(value) => setWechatConfig((prev) => ({ ...prev, platformPublicPem: value }))} />
                  <FieldInput label="回调地址 (Notify URL)" value={wechatConfig.notifyUrl} onChange={(value) => setWechatConfig((prev) => ({ ...prev, notifyUrl: value }))} />
                  <FieldTextarea label="API证书内容 (PEM)" value={wechatConfig.apiCertPem} onChange={(value) => setWechatConfig((prev) => ({ ...prev, apiCertPem: value }))} />
                  <FieldTextarea label="API私钥内容 (PEM)" value={wechatConfig.apiKeyPem} onChange={(value) => setWechatConfig((prev) => ({ ...prev, apiKeyPem: value }))} />
                </div>
              )}

              {activeMethod === 'alipay' && (
                <div className="grid grid-cols-2 gap-4">
                  <FieldInput label="应用APPID" value={alipayConfig.appId} onChange={(value) => setAlipayConfig((prev) => ({ ...prev, appId: value }))} />
                  <FieldInput label="签名类型" value={alipayConfig.signType} onChange={(value) => setAlipayConfig((prev) => ({ ...prev, signType: value }))} />
                  <FieldInput label="网关地址" value={alipayConfig.gatewayUrl} onChange={(value) => setAlipayConfig((prev) => ({ ...prev, gatewayUrl: value }))} />
                  <FieldInput label="回调地址 (Notify URL)" value={alipayConfig.notifyUrl} onChange={(value) => setAlipayConfig((prev) => ({ ...prev, notifyUrl: value }))} />
                  <FieldTextarea label="应用私钥" value={alipayConfig.appPrivateKey} onChange={(value) => setAlipayConfig((prev) => ({ ...prev, appPrivateKey: value }))} />
                  <FieldTextarea label="支付宝公钥" value={alipayConfig.alipayPublicKey} onChange={(value) => setAlipayConfig((prev) => ({ ...prev, alipayPublicKey: value }))} />
                  <FieldTextarea label="应用公钥证书" value={alipayConfig.appCert} onChange={(value) => setAlipayConfig((prev) => ({ ...prev, appCert: value }))} />
                  <FieldTextarea label="支付宝根证书" value={alipayConfig.alipayRootCert} onChange={(value) => setAlipayConfig((prev) => ({ ...prev, alipayRootCert: value }))} />
                </div>
              )}

              {activeMethod === 'bank' && (
                <div className="grid grid-cols-2 gap-4">
                  <FieldInput label="开户银行" value={bankConfig.bankName} onChange={(value) => setBankConfig((prev) => ({ ...prev, bankName: value }))} />
                  <FieldInput label="银行账号" value={bankConfig.accountNo} onChange={(value) => setBankConfig((prev) => ({ ...prev, accountNo: value }))} />
                  <FieldInput label="账户名称" value={bankConfig.accountName} onChange={(value) => setBankConfig((prev) => ({ ...prev, accountName: value }))} />
                </div>
              )}
            </div>

            <div className="p-6 border-t border-white/10">
              <button
                onClick={handleSaveConfig}
                className="w-full bg-primary hover:bg-primary/80 text-white py-3 rounded-lg font-medium"
              >
                保存配置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const FieldInput = ({
  label,
  value,
  onChange,
  type = 'text'
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) => (
  <label className="space-y-2 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
    />
  </label>
);

const FieldTextarea = ({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <label className="space-y-2 text-sm col-span-2">
    <span className="text-muted-foreground">{label}</span>
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={4}
      className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
    />
  </label>
);

export default Payment;
