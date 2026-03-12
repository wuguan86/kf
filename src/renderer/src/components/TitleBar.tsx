import React from 'react'
import styles from './TitleBar.module.css'

const TitleBar = () => {
  const handleMinimize = () => {
    // @ts-ignore
    window.api?.minimizeWindow()
  }

  const handleClose = () => {
    // @ts-ignore
    window.api?.closeWindow()
  }

  return (
    <div className={styles.titleBar}>
      <div className={styles.dragRegion}></div>
      <div className={styles.windowControls}>
        <button className={styles.controlBtn} onClick={handleMinimize}>
          <svg width="10" height="1" viewBox="0 0 10 1" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 0.5H10" stroke="currentColor" strokeWidth="1"/>
          </svg>
        </button>
        <button className={`${styles.controlBtn} ${styles.closeBtn}`} onClick={handleClose}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" stroke="currentColor" strokeWidth="1"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

export default TitleBar
