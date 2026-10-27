import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onHome: () => void
}

interface State {
  error: Error | null
}

/**
 * Catches a screen that crashes or fails to load (for example a game whose
 * code was replaced by a newer deploy) and offers a way out instead of a
 * blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen failed:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="casing">
        <div className="casing__plate">THE ATOMIC HUB</div>
        <main className="screen crash" role="alert">
          <h1 className="term-heading">This screen didn’t load</h1>
          <p>The hub may have just been updated. Reloading picks up the latest version.</p>
          <div className="crash__actions">
            <button className="term-button term-button--primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button
              className="term-button"
              onClick={() => {
                this.setState({ error: null })
                this.props.onHome()
              }}
            >
              Back to menu
            </button>
          </div>
        </main>
      </div>
    )
  }
}
