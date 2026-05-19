import React from 'react'
import styles from '../pages/AssistantPage.module.css'

type WeChatChannel = 'personal' | 'enterprise'
type ManagedMode = 'full' | 'semi'

type Props = {
  wechatChannel: WeChatChannel
  managedMode: ManagedMode
  disabled: boolean
  showEnterpriseConfig: boolean
  startButtonClassName: string
  startButtonContent: React.ReactNode
  onWechatChannelChange: (value: WeChatChannel) => void
  onManagedModeChange: (value: ManagedMode) => void
  onOpenEnterpriseConfig: () => void
  onToggleRunning: () => void
}

export default function AssistantRunToolbar(props: Props): JSX.Element {
  const {
    wechatChannel,
    managedMode,
    disabled,
    showEnterpriseConfig,
    startButtonClassName,
    startButtonContent,
    onWechatChannelChange,
    onManagedModeChange,
    onOpenEnterpriseConfig,
    onToggleRunning
  } = props

  return (
    <div className={styles.pageHeaderActions}>
      <label className={styles.toolbarSelectWrap} title="选择微信消息通道">
        <span className={styles.selectIcon}>{wechatChannel === 'enterprise' ? '企' : '微'}</span>
        <select
          className={styles.toolbarSelect}
          value={wechatChannel}
          disabled={disabled}
          onChange={(event) => onWechatChannelChange(event.target.value as WeChatChannel)}
        >
          <option value="personal">个人微信</option>
          <option value="enterprise">企业微信</option>
        </select>
      </label>

      <label className={styles.toolbarSelectWrap} title="选择托管模式">
        <span className={styles.selectIcon}>{managedMode === 'full' ? '全' : '半'}</span>
        <select
          className={styles.toolbarSelect}
          value={managedMode}
          disabled={disabled}
          onChange={(event) => onManagedModeChange(event.target.value as ManagedMode)}
        >
          <option value="full">全托管</option>
          <option value="semi">半托管</option>
        </select>
      </label>

      {showEnterpriseConfig && (
        <button className={styles.configBtn} type="button" onClick={onOpenEnterpriseConfig} disabled={disabled}>
          配置
        </button>
      )}

      <button
        className={startButtonClassName}
        onClick={onToggleRunning}
        disabled={disabled}
        title={!disabled ? '点击接管微信聊天窗口' : undefined}
        type="button"
      >
        {startButtonContent}
      </button>
    </div>
  )
}
