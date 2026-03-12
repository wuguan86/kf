import React, { useState } from 'react'
import styles from './TagInput.module.css'

interface TagInputProps {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  disabled?: boolean
}

export const TagInput = ({ value, onChange, placeholder, disabled }: TagInputProps) => {
  const [inputValue, setInputValue] = useState('')

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const trimmed = inputValue.trim()
      if (trimmed) {
        if (!value.includes(trimmed)) {
          onChange([...value, trimmed])
        }
        setInputValue('')
      }
    }
  }

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove))
  }

  return (
    <div className={`${styles.tagInputContainer} ${disabled ? styles.disabled : ''}`}>
      <div className={styles.tagList}>
        {value.map((tag) => (
          <span key={tag} className={styles.tag}>
            {tag}
            {!disabled && (
              <span className={styles.tagClose} onClick={() => removeTag(tag)}>
                ×
              </span>
            )}
          </span>
        ))}
        <input
          className={styles.tagInputField}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          disabled={disabled}
        />
      </div>
    </div>
  )
}
