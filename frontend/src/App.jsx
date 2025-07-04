import React, { useState } from 'react'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import './index.css'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)

  const handleLogin = (userData) => {
    setIsAuthenticated(true)
    setUser(userData)
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    setUser(null)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <svg className="w-8 h-8 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1l3.09 6.26L22 9l-5 4.87L18.18 21 12 17.77 5.82 21 7 13.87 2 9l6.91-1.74L12 1z"/>
                </svg>
                <h1 className="text-xl font-bold text-gray-900">COS Checker</h1>
              </div>
              <span className="text-sm text-gray-500 hidden sm:block">
                Certificate of Sponsorship Verification
              </span>
            </div>
            
            {isAuthenticated && (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600">Welcome, {user?.username}</span>
                <button
                  onClick={handleLogout}
                  className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isAuthenticated ? (
          <Dashboard user={user} onLogout={handleLogout} />
        ) : (
          <Login onLogin={handleLogin} />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h4 className="font-semibold text-gray-900 mb-4">About COS Checker</h4>
              <p className="text-sm text-gray-600">
                Advanced PDF metadata analysis system for Certificate of Sponsorship verification. 
                Powered by PyMuPDF, FastAPI, and machine learning algorithms.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-4">Technical Stack</h4>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>• PyMuPDF for PDF Processing</li>
                <li>• FastAPI with Async Support</li>
                <li>• DuckDB In-Process Database</li>
                <li>• ONNX Runtime for ML Inference</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-4">System Status</h4>
              <div className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span>All Systems Operational</span>
              </div>
              <div className="text-sm text-gray-500">
                <p>Last Updated: {new Date().toLocaleString()}</p>
                <p>Version: 3.0.0</p>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App