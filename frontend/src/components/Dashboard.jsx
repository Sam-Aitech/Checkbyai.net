import React, { useState, useEffect } from 'react'
import FileUpload from './FileUpload'
import VerificationResult from './VerificationResult'

const Dashboard = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('verify')
  const [verificationResult, setVerificationResult] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [stats, setStats] = useState({
    trusted_patterns: 0,
    verifications_today: 0,
    suspicious_docs: 0,
    success_rate: '0.0'
  })
  const [trustedPatterns, setTrustedPatterns] = useState([])
  const [recentActivity, setRecentActivity] = useState([])

  // Fetch stats from API
  useEffect(() => {
    fetchStats()
    if (user.role === 'admin') {
      fetchTrustedPatterns()
      fetchRecentActivity()
    }
  }, [user.role])

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/stats')
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  const fetchTrustedPatterns = async () => {
    try {
      const response = await fetch('/api/trusted-patterns')
      if (response.ok) {
        const data = await response.json()
        setTrustedPatterns(data)
      }
    } catch (error) {
      console.error('Failed to fetch trusted patterns:', error)
    }
  }

  const fetchRecentActivity = async () => {
    try {
      const response = await fetch('/api/admin/recent-activity')
      if (response.ok) {
        const data = await response.json()
        setRecentActivity(data)
      }
    } catch (error) {
      console.error('Failed to fetch recent activity:', error)
    }
  }

  const handleVerifyDocument = async (file) => {
    setIsLoading(true)
    setVerificationResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/verify', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const result = await response.json()
        setVerificationResult(result)
        // Refresh stats after verification
        fetchStats()
      } else {
        const error = await response.json()
        alert(`Verification failed: ${error.detail}`)
      }
    } catch (error) {
      console.error('Verification error:', error)
      alert('Verification failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUploadTrustedPattern = async (file) => {
    setIsLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/admin/upload-pattern', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const result = await response.json()
        alert(`Successfully added trusted pattern: ${result.filename}`)
        // Refresh patterns and stats
        fetchTrustedPatterns()
        fetchStats()
      } else {
        const error = await response.json()
        alert(`Upload failed: ${error.detail}`)
      }
    } catch (error) {
      console.error('Upload error:', error)
      alert('Upload failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeletePattern = async (patternId) => {
    if (!window.confirm('Are you sure you want to delete this trusted pattern?')) {
      return
    }

    try {
      const response = await fetch(`/api/admin/trusted-patterns/${patternId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        alert('Pattern deleted successfully')
        fetchTrustedPatterns()
        fetchStats()
      } else {
        const error = await response.json()
        alert(`Delete failed: ${error.detail}`)
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('Delete failed. Please try again.')
    }
  }

  const handleNewVerification = () => {
    setVerificationResult(null)
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString()
  }

  const formatTime = (dateString) => {
    return new Date(dateString).toLocaleTimeString()
  }

  return (
    <div>
      {/* Navigation Tabs */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('verify')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'verify'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Verify Documents
          </button>
          
          {user.role === 'admin' && (
            <>
              <button
                onClick={() => setActiveTab('manage')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'manage'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Manage Patterns
              </button>
              
              <button
                onClick={() => setActiveTab('analytics')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'analytics'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Analytics
              </button>
            </>
          )}
        </nav>
      </div>

      {/* Stats Dashboard */}
      <div className="grid md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Trusted Patterns</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.trusted_patterns}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Verifications Today</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.verifications_today}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92z"/>
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Suspicious Docs</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.suspicious_docs}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-gray-100 rounded-lg">
              <svg className="w-6 h-6 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"/>
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Success Rate</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.success_rate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'verify' && (
        <div>
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Verify Certificate of Sponsorship</h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Upload your COS document for instant verification against our database of trusted patterns. 
              Our AI-powered system analyzes PDF metadata to detect genuine, edited, or fraudulent documents.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-6">Upload Document</h3>
              <FileUpload
                onFileSelect={() => {}}
                onVerify={handleVerifyDocument}
                isLoading={isLoading}
                accept=".pdf"
              />
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-6">Verification Process</h3>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                    1
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">PyMuPDF Analysis</h4>
                    <p className="text-sm text-gray-600">Extract comprehensive PDF metadata including fonts, images, and structure</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                    2
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">Pattern Matching</h4>
                    <p className="text-sm text-gray-600">Compare against trusted patterns using advanced similarity algorithms</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                    3
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">AI Verification</h4>
                    <p className="text-sm text-gray-600">ONNX Runtime ML inference with TF-IDF vectorization</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {verificationResult && (
            <div className="mt-8">
              <VerificationResult 
                result={verificationResult} 
                onNewVerification={handleNewVerification}
              />
            </div>
          )}
        </div>
      )}

      {user.role === 'admin' && activeTab === 'manage' && (
        <div>
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Manage Trusted Patterns</h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Upload genuine COS documents to expand the verification database and improve accuracy.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-6">Upload Trusted Pattern</h3>
              <FileUpload
                onFileSelect={handleUploadTrustedPattern}
                isLoading={isLoading}
                accept=".pdf"
              />
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-6">Trusted Patterns ({trustedPatterns.length})</h3>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {trustedPatterns.map((pattern) => (
                  <div key={pattern.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{pattern.filename}</p>
                        <p className="text-xs text-gray-500">Added {formatDate(pattern.uploaded_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        pattern.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {pattern.status}
                      </span>
                      <button
                        onClick={() => handleDeletePattern(pattern.id)}
                        className="text-red-500 hover:text-red-700 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {user.role === 'admin' && activeTab === 'analytics' && (
        <div>
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">System Analytics</h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Monitor verification activity and system performance metrics.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <h3 className="text-xl font-semibold text-gray-900 mb-6">Recent Verification Activity</h3>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Time</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Document</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Result</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Confidence</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.map((activity) => (
                    <tr key={activity.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm text-gray-600">{formatTime(activity.verified_at)}</td>
                      <td className="py-3 px-4 text-sm text-gray-900">{activity.filename}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          activity.result === 'genuine' ? 'bg-green-100 text-green-700' :
                          activity.result === 'suspicious' ? 'bg-yellow-100 text-yellow-700' : 
                          'bg-red-100 text-red-700'
                        }`}>
                          {activity.result.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">{activity.confidence.toFixed(1)}%</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{activity.ip_address || 'Unknown'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard