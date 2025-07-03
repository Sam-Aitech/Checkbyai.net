import { useState } from "react";
import UserPortal from "@/components/UserPortal";
import AdminPortal from "@/components/AdminPortal";
import { useQuery } from "@tanstack/react-query";
import { Shield, Database } from "lucide-react";

export default function Home() {
  const [activeMode, setActiveMode] = useState<'user' | 'admin'>('user');

  const { data: stats } = useQuery({
    queryKey: ['/api/stats'],
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Shield className="text-primary text-2xl" />
                <h1 className="text-xl font-bold text-gray-900">COS Checker</h1>
              </div>
              <span className="text-sm text-gray-500 hidden sm:block">
                Certificate of Sponsorship Verification
              </span>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setActiveMode('user')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                    activeMode === 'user'
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span className="fas fa-user mr-2"></span>User Portal
                </button>
                <button
                  onClick={() => setActiveMode('admin')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                    activeMode === 'admin'
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span className="fas fa-cog mr-2"></span>Admin Portal
                </button>
              </div>
              
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Database className="h-4 w-4" />
                <span>{stats?.trustedPatterns || 0}</span>
                <span className="hidden sm:inline">trusted patterns</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeMode === 'user' ? <UserPortal /> : <AdminPortal />}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h4 className="font-semibold text-gray-900 mb-4">About COS Checker</h4>
              <p className="text-sm text-gray-600">
                Advanced PDF metadata analysis system for Certificate of Shipment verification. 
                Powered by machine learning and trusted pattern recognition.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-4">Technical Details</h4>
              <ul className="text-sm text-gray-600 space-y-2">
                <li><span className="fas fa-check mr-2 text-green-500"></span>XMP Metadata Extraction</li>
                <li><span className="fas fa-check mr-2 text-green-500"></span>Vector Similarity Analysis</li>
                <li><span className="fas fa-check mr-2 text-green-500"></span>ONNX Runtime ML Models</li>
                <li><span className="fas fa-check mr-2 text-green-500"></span>Rule-based Pattern Matching</li>
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
                <p>Version: 2.1.3</p>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
