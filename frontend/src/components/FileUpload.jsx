import React, { useState, useCallback } from 'react'

const FileUpload = ({ onFileSelect, onVerify, isLoading = false, accept = ".pdf" }) => {
  const [selectedFile, setSelectedFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  const handleDrag = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      if (file.type === 'application/pdf') {
        setSelectedFile(file)
        onFileSelect?.(file)
      } else {
        alert('Please select a PDF file')
      }
    }
  }, [onFileSelect])

  const handleChange = useCallback((e) => {
    e.preventDefault()
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setSelectedFile(file)
      onFileSelect?.(file)
    }
  }, [onFileSelect])

  const handleVerify = () => {
    if (selectedFile && onVerify) {
      onVerify(selectedFile)
    }
  }

  const removeFile = () => {
    setSelectedFile(null)
    setUploadProgress(0)
  }

  // Simulate upload progress when loading
  React.useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval)
            return 100
          }
          return prev + 10
        })
      }, 200)
      return () => clearInterval(interval)
    } else {
      setUploadProgress(0)
    }
  }, [isLoading])

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        className={`upload-area ${dragActive ? 'dragover' : ''} ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !isLoading && document.getElementById('fileInput').click()}
      >
        <input
          id="fileInput"
          type="file"
          accept={accept}
          onChange={handleChange}
          disabled={isLoading}
          className="hidden"
        />
        
        <div className="flex flex-col items-center">
          <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          
          {dragActive ? (
            <p className="text-gray-600 mb-2">Drop the PDF file here...</p>
          ) : (
            <div className="text-center">
              <p className="text-gray-600 mb-2">Choose PDF file or drag it here</p>
              <p className="text-sm text-gray-400">
                Maximum file size: 50MB
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Selected File Display */}
      {selectedFile && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
              </svg>
              <span className="text-sm font-medium text-gray-900">{selectedFile.name}</span>
              <span className="text-xs text-gray-500">
                ({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)
              </span>
            </div>
            
            {!isLoading && (
              <button
                onClick={removeFile}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Progress Bar */}
          {isLoading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Processing...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Verify Button */}
          {onVerify && !isLoading && (
            <button
              onClick={handleVerify}
              className="w-full mt-4 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              Verify Document
            </button>
          )}
        </div>
      )}

      {/* File Requirements */}
      <div className="text-xs text-gray-500">
        <p><strong>Supported format:</strong> PDF files only</p>
        <p><strong>Maximum size:</strong> 50MB per file</p>
        <p><strong>Processing time:</strong> Usually takes 5-10 seconds</p>
      </div>
    </div>
  )
}

export default FileUpload