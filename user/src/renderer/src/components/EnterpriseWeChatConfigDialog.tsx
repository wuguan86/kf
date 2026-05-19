import React, { useEffect, useState } from 'react'
import http from '../utils/http'
import styles from './EnterpriseWeChatConfigDialog.module.css'

export type WeChatChannelConfig = {
  channel: 'personal' | 'enterprise'
  corpId: string
  apiBaseUrl: string
  secretConfigured: 'true' | 'false'
  tokenConfigured: 'true' | 'false'
  encodingAesKeyConfigured: 'true' | 'false'
}

type EnterpriseWeChatBinding = {
  enterpriseUserId: string
  enterpriseUserName: string
  remark: string
  status: 'ENABLED' | 'DISABLED'
}

type Props = {
  open: boolean
  config: WeChatChannelConfig
  onClose: () => void
  onSaved: (config: WeChatChannelConfig) => void
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void
}

const emptyBinding: EnterpriseWeChatBinding = {
  enterpriseUserId: '',
  enterpriseUserName: '',
  remark: '',
  status: 'ENABLED'
}

export default function EnterpriseWeChatConfigDialog(props: Props): JSX.Element | null {
  const { open, config, onClose, onSaved, showToast } = props
  const [channelForm, setChannelForm] = useState({
    corpId: '',
    apiBaseUrl: '',
    secret: '',
    token: '',
    encodingAesKey: ''
  })
  const [bindingForm, setBindingForm] = useState<EnterpriseWeChatBinding>(emptyBinding)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setChannelForm({
      corpId: config.corpId || '',
      apiBaseUrl: config.apiBaseUrl || '',
      secret: '',
      token: '',
      encodingAesKey: ''
    })
    const loadBinding = async () => {
      setLoading(true)
      try {
        const binding = await http.get<Partial<EnterpriseWeChatBinding> | null>('/api/user/enterprise-wechat/my-binding')
        setBindingForm({
          enterpriseUserId: binding?.enterpriseUserId || '',
          enterpriseUserName: binding?.enterpriseUserName || '',
          remark: binding?.remark || '',
          status: binding?.status === 'DISABLED' ? 'DISABLED' : 'ENABLED'
        })
      } catch (error) {
        console.error('加载企业微信本人映射失败', error)
        showToast('加载企业微信客服映射失败', 'error')
        setBindingForm(emptyBinding)
      } finally {
        setLoading(false)
      }
    }
    void loadBinding()
  }, [open, config, showToast])

  if (!open) return null

  const handleSave = async () => {
    if (!bindingForm.enterpriseUserId.trim()) {
      showToast('请填写企业微信 userid', 'error')
      return
    }
    setSaving(true)
    try {
      await http.post('/api/user/system-config/wechat-channel', {
        channel: 'enterprise',
        corpId: channelForm.corpId,
        apiBaseUrl: channelForm.apiBaseUrl,
        secret: channelForm.secret,
        token: channelForm.token,
        encodingAesKey: channelForm.encodingAesKey
      })
      await http.post('/api/user/enterprise-wechat/my-binding', bindingForm)
      const latest = await http.get<WeChatChannelConfig>('/api/user/system-config/wechat-channel')
      onSaved({
        channel: latest?.channel === 'enterprise' ? 'enterprise' : 'personal',
        corpId: latest?.corpId || '',
        apiBaseUrl: latest?.apiBaseUrl || '',
        secretConfigured: latest?.secretConfigured === 'true' ? 'true' : 'false',
        tokenConfigured: latest?.tokenConfigured === 'true' ? 'true' : 'false',
        encodingAesKeyConfigured: latest?.encodingAesKeyConfigured === 'true' ? 'true' : 'false'
      })
      setChannelForm((prev) => ({ ...prev, secret: '', token: '', encodingAesKey: '' }))
      showToast('企业微信配置已保存', 'success')
      onClose()
    } catch (error: any) {
      console.error('保存企业微信配置失败', error)
      showToast(`保存企业微信配置失败: ${error?.message || '未知错误'}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.dialog}>
        <header className={styles.header}>
          <div>
            <h3>企业微信配置</h3>
            <p>密钥留空会保留已配置的旧值。</p>
          </div>
          <button className={styles.closeBtn} type="button" onClick={onClose} aria-label="关闭">x</button>
        </header>

        <div className={styles.body}>
          <section className={styles.section}>
            <h4>消息通道</h4>
            <div className={styles.grid}>
              <Field label="CorpID" value={channelForm.corpId} onChange={(value) => setChannelForm({ ...channelForm, corpId: value })} />
              <Field label="API 地址" value={channelForm.apiBaseUrl} onChange={(value) => setChannelForm({ ...channelForm, apiBaseUrl: value })} placeholder="默认 https://qyapi.weixin.qq.com" />
              <Field label={`Secret${config.secretConfigured === 'true' ? '（已配置）' : ''}`} type="password" value={channelForm.secret} onChange={(value) => setChannelForm({ ...channelForm, secret: value })} placeholder="留空则不修改" />
              <Field label={`回调 Token${config.tokenConfigured === 'true' ? '（已配置）' : ''}`} type="password" value={channelForm.token} onChange={(value) => setChannelForm({ ...channelForm, token: value })} placeholder="留空则不修改" />
              <Field label={`EncodingAESKey${config.encodingAesKeyConfigured === 'true' ? '（已配置）' : ''}`} type="password" value={channelForm.encodingAesKey} onChange={(value) => setChannelForm({ ...channelForm, encodingAesKey: value })} placeholder="留空则不修改" />
            </div>
          </section>

          <section className={styles.section}>
            <h4>我的客服映射</h4>
            <div className={styles.grid}>
              <Field label="企微 userid" value={bindingForm.enterpriseUserId} onChange={(value) => setBindingForm({ ...bindingForm, enterpriseUserId: value })} />
              <Field label="企微名称" value={bindingForm.enterpriseUserName} onChange={(value) => setBindingForm({ ...bindingForm, enterpriseUserName: value })} />
              <Field label="备注" value={bindingForm.remark} onChange={(value) => setBindingForm({ ...bindingForm, remark: value })} />
              <label className={styles.field}>
                <span>状态</span>
                <select value={bindingForm.status} onChange={(e) => setBindingForm({ ...bindingForm, status: e.target.value as EnterpriseWeChatBinding['status'] })}>
                  <option value="ENABLED">启用</option>
                  <option value="DISABLED">停用</option>
                </select>
              </label>
            </div>
          </section>
        </div>

        <footer className={styles.footer}>
          {loading && <span className={styles.loadingText}>正在加载...</span>}
          <button className={styles.cancelBtn} type="button" onClick={onClose} disabled={saving}>取消</button>
          <button className={styles.saveBtn} type="button" onClick={handleSave} disabled={saving || loading}>
            {saving ? '保存中...' : '保存配置'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function Field(props: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  const { label, value, onChange, type = 'text', placeholder = '' } = props
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
