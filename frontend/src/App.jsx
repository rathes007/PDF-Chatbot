import { useState, useEffect } from 'react'
import { Header } from './components/Header'
import { ChatInterface } from './components/ChatInterface'
import { Dashboard } from './components/Dashboard'

function App() {
  const [theme, setTheme] = useState('light')
  const [currentView, setView] = useState('chat')

  // Initialize theme from system preference or local storage
  useEffect(() => {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark')
    }
  }, [])

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  return (
    <div className="min-h-screen bg-background text-text transition-colors duration-300 font-sans selection:bg-primary/20">
      <Header
        theme={theme}
        toggleTheme={toggleTheme}
        currentView={currentView}
        setView={setView}
      />

      <main className="container mx-auto py-4">
        {currentView === 'chat' ? (
          <ChatInterface />
        ) : (
          <Dashboard />
        )}
      </main>
    </div>
  )
}

export default App
