import React from 'react'

const VerificationResult = ({ result, onDownloadReport, onNewVerification }) => {
  if (!result) return null

  const getResultConfig = () => {
    switch (result.result) {
      case 'genuine':
        return {
          icon: '✓',
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          label: 'GENUINE',
          description: 'Document appears to be authentic based on our analysis'
        }
      case 'suspicious':
        return {
          icon: '⚠',
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          label: 'SUSPICIOUS',
          description: 'Document shows some irregularities that require manual review'
        }
      case 'fake':
        return {
          icon: '✕',
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          label: 'FAKE',
          description: 'Document appears to be fraudulent or heavily modified'
        }
      default:
        return {
          icon: '?',
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          label: 'UNKNOWN',
          description: 'Unable to determine document authenticity'
        }
    }
  }

  const config = getResultConfig()

  const handleDownloadReport = () => {
    const reportData = {
      verification_id: result.id,
      result: result.result,
      confidence: result.confidence,
      timestamp: new Date().toISOString(),
      details: result.details
    }

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `verification-report-${result.id}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    if (onDownloadReport) {
      onDownloadReport(reportData)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 mb-8">
      <h3 className="text-2xl font-bold text-gray-900 mb-6">Verification Results</h3>
      
      {/* Main Result */}
      <div className={`text-center p-8 ${config.bgColor} rounded-lg border ${config.borderColor} mb-8`}>
        <div className={`w-20 h-20 ${config.color.replace('text-', 'bg-').replace('-600', '-500')} text-white rounded-full flex items-center justify-center mx-auto mb-4 text-4xl font-bold`}>
          {config.icon}
        </div>
        <h4 className={`font-bold text-3xl ${config.color} mb-2`}>
          {config.label}
        </h4>
        <p className={`text-xl font-semibold ${config.color} mb-3`}>
          {result.confidence.toFixed(1)}% Confidence
        </p>
        <p className={`text-sm ${config.color} max-w-md mx-auto`}>
          {config.description}
        </p>
      </div>

      {/* Detailed Analysis */}
      {result.details && (
        <div className="bg-gray-50 rounded-lg p-6 mb-6">
          <h4 className="font-semibold text-gray-900 mb-4">Detailed Analysis</h4>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Metadata Verification */}
            <div>
              <h5 className="font-medium text-gray-700 mb-3">Metadata Verification</h5>
              <div className="space-y-3">
                {result.details.metadata_verification && Object.entries(result.details.metadata_verification).map(([key, value]) => (
                  <div key={key} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        value.score > 80 ? 'bg-green-100 text-green-700' :
                        value.score > 50 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {value.status}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {value.score?.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pattern Matching */}
            <div>
              <h5 className="font-medium text-gray-700 mb-3">Pattern Analysis</h5>
              <div className="space-y-3">
                {result.details.pattern_matching && Object.entries(result.details.pattern_matching).map(([key, value]) => (
                  <div key={key} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <span className={`text-sm font-medium ${
                      value > 80 ? 'text-green-600' :
                      value > 50 ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {typeof value === 'number' ? `${value.toFixed(1)}%` : value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ML Confidence */}
          {result.details.ml_confidence && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-700">ML Model Confidence</span>
                <span className={`text-lg font-bold ${
                  result.details.ml_confidence > 80 ? 'text-green-600' :
                  result.details.ml_confidence > 50 ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {result.details.ml_confidence.toFixed(1)}%
                </span>
              </div>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    result.details.ml_confidence > 80 ? 'bg-green-500' :
                    result.details.ml_confidence > 50 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${result.details.ml_confidence}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={handleDownloadReport}
          className="flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download Report
        </button>
        
        {onNewVerification && (
          <button
            onClick={onNewVerification}
            className="flex items-center justify-center px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Verify Another Document
          </button>
        )}
      </div>
    </div>
  )
}

export default VerificationResult