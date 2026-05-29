import React from 'react'
import styles from '../pages/AssistantPage.module.css'

type ManagedMode = 'full' | 'semi'

type Props = {
  managedMode: ManagedMode
  configurationDisabled: boolean
  startButtonDisabled: boolean
  startButtonClassName: string
  startButtonContent: React.ReactNode
  onManagedModeChange: (value: ManagedMode) => void
  onToggleRunning: () => void
}

type DropdownOption<T extends string> = {
  value: T
  label: string
  icon: React.ReactNode
}

const ChevronDownIcon = (): JSX.Element => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M4.5 6.3 8 9.7l3.5-3.4" />
  </svg>
)

const ManagedModeIcon = ({ mode }: { mode: ManagedMode }): JSX.Element => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {mode === 'full' ? (
      <>
        <path d="M12 2.8 19.6 6v5.5c0 4.7-3.1 8.5-7.6 9.8-4.5-1.3-7.6-5.1-7.6-9.8V6L12 2.8Z" />
        <path d="M8.4 11.7h7.2M12 8.1v7.2" className={styles.iconStroke} />
      </>
    ) : (
      <>
        <path d="M5 5.7c0-.8.6-1.4 1.4-1.4h11.2c.8 0 1.4.6 1.4 1.4v8.4c0 .8-.6 1.4-1.4 1.4H6.4c-.8 0-1.4-.6-1.4-1.4V5.7Z" />
        <path d="M8.1 19.1h7.8M12 15.5v3.6M8.3 9.8h7.4" className={styles.iconStroke} />
      </>
    )}
  </svg>
)

function ToolbarDropdown<T extends string>(props: {
  title: string
  disabledTitle: string
  value: T
  disabled: boolean
  options: DropdownOption<T>[]
  onChange: (value: T) => void
}): JSX.Element {
  const { title, disabledTitle, value, disabled, options, onChange } = props
  const [isOpen, setIsOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const selectedOption = options.find((option) => option.value === value) || options[0]

  React.useEffect(() => {
    if (!isOpen) {
      return undefined
    }
    const closeDropdown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', closeDropdown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', closeDropdown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const selectOption = (nextValue: T) => {
    if (disabled) {
      return
    }
    onChange(nextValue)
    setIsOpen(false)
  }

  return (
    <div
      ref={rootRef}
      className={`${styles.toolbarSelectWrap} ${disabled ? styles.toolbarSelectWrapDisabled : ''}`}
      title={disabled ? disabledTitle : title}
    >
      <button
        className={styles.toolbarSelectButton}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        {selectedOption.icon}
        <span className={styles.toolbarSelectText}>{selectedOption.label}</span>
        <span className={styles.toolbarSelectChevron}>
          <ChevronDownIcon />
        </span>
      </button>

      {isOpen && !disabled && (
        <div className={styles.toolbarSelectMenu} role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              className={`${styles.toolbarSelectOption} ${option.value === value ? styles.toolbarSelectOptionActive : ''}`}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => selectOption(option.value)}
            >
              {option.icon}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AssistantRunToolbar(props: Props): JSX.Element {
  const {
    managedMode,
    configurationDisabled,
    startButtonDisabled,
    startButtonClassName,
    startButtonContent,
    onManagedModeChange,
    onToggleRunning
  } = props
  const managedModeOptions: DropdownOption<ManagedMode>[] = [
    {
      value: 'full',
      label: '全托管',
      icon: (
        <span className={styles.selectIcon}>
          <ManagedModeIcon mode="full" />
        </span>
      )
    },
    {
      value: 'semi',
      label: '半托管',
      icon: (
        <span className={styles.selectIcon}>
          <ManagedModeIcon mode="semi" />
        </span>
      )
    }
  ]

  return (
    <div className={styles.pageHeaderActions}>
      <ToolbarDropdown
        title="选择托管模式"
        disabledTitle="运行中请先停止运行，再切换托管模式"
        value={managedMode}
        disabled={configurationDisabled}
        options={managedModeOptions}
        onChange={onManagedModeChange}
      />

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
