import React, { Component, ErrorInfo, ReactNode } from 'react'
import styles from './ErrorBoundary.module.css'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className={styles.container}>
          <h1 className={styles.title}>出错了 / Something went wrong</h1>
          <div className={styles.card}>
            <h3 className={styles.errorTitle}>Error: {this.state.error?.toString()}</h3>
            <details className={styles.details}>
              <summary className={styles.summary}>View Component Stack</summary>
              {this.state.errorInfo?.componentStack}
            </details>
            <div className={styles.actions}>
              <button 
                onClick={() => window.location.reload()}
                className={styles.reloadBtn}
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
