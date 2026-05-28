import React from 'react'
import styles from '../pages/AssistantPage.module.css'

type WeChatChannel = 'personal' | 'enterprise'
type ManagedMode = 'full' | 'semi'

type Props = {
  wechatChannel: WeChatChannel
  managedMode: ManagedMode
  configurationDisabled: boolean
  startButtonDisabled: boolean
  startButtonClassName: string
  startButtonContent: React.ReactNode
  onWechatChannelChange: (value: WeChatChannel) => void
  onManagedModeChange: (value: ManagedMode) => void
  onToggleRunning: () => void
}

export default function AssistantRunToolbar(props: Props): JSX.Element {
  const {
    wechatChannel,
    managedMode,
    configurationDisabled,
    startButtonDisabled,
    startButtonClassName,
    startButtonContent,
    onWechatChannelChange,
    onManagedModeChange,
    onToggleRunning
  } = props

  return (
    <div className={styles.pageHeaderActions}>
      <label
        className={`${styles.toolbarSelectWrap} ${configurationDisabled ? styles.toolbarSelectWrapDisabled : ''}`}
        title={configurationDisabled ? '运行中请先停止运行，再切换微信消息通道' : '选择微信消息通道'}
      >
        <span className={styles.selectIcon}>{wechatChannel === 'enterprise' ? '企' : '微'}</span>
        <select
          className={styles.toolbarSelect}
          value={wechatChannel}
          disabled={configurationDisabled}
          onChange={(event) => onWechatChannelChange(event.target.value as WeChatChannel)}
        >
          <option value="personal">个人微信</option>
          <option value="enterprise">企业微信</option>
        </select>
      </label>

      <label
        className={`${styles.toolbarSelectWrap} ${configurationDisabled ? styles.toolbarSelectWrapDisabled : ''}`}
        title={configurationDisabled ? '运行中请先停止运行，再切换托管模式' : '选择托管模式'}
      >
        <span className={styles.selectIcon}>{managedMode === 'full' ? '全' : '半'}</span>
        <select
          className={styles.toolbarSelect}
          value={managedMode}
          disabled={configurationDisabled}
          onChange={(event) => onManagedModeChange(event.target.value as ManagedMode)}
        >
          <option value="full">全托管</option>
          <option value="semi">半托管</option>
        </select>
      </label>

      <button
        className={startButtonClassName}
        onClick={onToggleRunning}
        disabled={startButtonDisabled}
        title={!startButtonDisabled ? '点击接管微信聊天窗口' : undefined}
        type="button"
      >
        {startButtonContent}
      </button>
    </div>
  )
}
