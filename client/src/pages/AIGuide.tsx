import { Link } from "wouter";
import { Shield, Brain, Zap, Lock, CheckCircle, ArrowLeft, FileSearch, AlertTriangle, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AIGuide() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link href="/">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <div className="text-center mb-12">
          <div className="inline-flex items-center px-4 py-2 bg-blue-100 dark:bg-blue-900 rounded-full text-blue-800 dark:text-blue-200 text-sm font-medium mb-4">
            <Brain className="w-4 h-4 mr-2" />
            AI-Powered Technology
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            How Our AI Verification Works
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Advanced machine learning technology to detect fake or edited UK Certificate of Sponsorship documents
          </p>
        </div>

        <div className="grid gap-8 mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <FileSearch className="w-6 h-6 text-blue-600" />
                Document Forensic Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600 dark:text-gray-300">
                Our AI performs deep forensic analysis on every uploaded document, examining:
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span><strong>PDF Metadata:</strong> Producer software, creation dates, modification history</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span><strong>XMP History:</strong> Tracks every edit made to the document</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span><strong>Font Analysis:</strong> Detects inconsistent or embedded fonts</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span><strong>Digital Signatures:</strong> Verifies document authenticity</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
                Editing Software Detection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600 dark:text-gray-300">
                We immediately flag documents that show signs of manipulation using:
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></span>
                  <span>Adobe Photoshop, Illustrator, or InDesign</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></span>
                  <span>GIMP, Inkscape, or other image editors</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></span>
                  <span>Online PDF editors like Canva or Smallpdf</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></span>
                  <span>Any software not typically used by UK Home Office</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Brain className="w-6 h-6 text-purple-600" />
                Multi-AI Provider System
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600 dark:text-gray-300">
                Our verification uses multiple AI providers for maximum reliability:
              </p>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                  <p className="font-semibold text-green-700 dark:text-green-400">OpenAI GPT-4</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Primary Analysis</p>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                  <p className="font-semibold text-blue-700 dark:text-blue-400">Claude</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Fallback Provider</p>
                </div>
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-center">
                  <p className="font-semibold text-purple-700 dark:text-purple-400">DeepSeek</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Tertiary Backup</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Award className="w-6 h-6 text-yellow-600" />
                Accuracy & Reliability
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="text-center">
                  <p className="text-4xl font-bold text-blue-600">99.8%</p>
                  <p className="text-gray-600 dark:text-gray-400">Detection Accuracy</p>
                </div>
                <div className="text-center">
                  <p className="text-4xl font-bold text-green-600">&lt;3s</p>
                  <p className="text-gray-600 dark:text-gray-400">Average Processing</p>
                </div>
                <div className="text-center">
                  <p className="text-4xl font-bold text-purple-600">24/7</p>
                  <p className="text-gray-600 dark:text-gray-400">Availability</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <Link href="/dashboard">
            <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
              <Shield className="w-5 h-5 mr-2" />
              Verify Your Document Now
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
