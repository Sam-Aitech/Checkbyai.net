import FileUploadSimple from './FileUploadSimple';

export default function DashboardClean() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Certificate of Sponsorship Verifier</h1>
      
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-medium mb-4 text-gray-900 dark:text-gray-100">Upload COS Document</h2>
        <FileUploadSimple />
      </div>
    </div>
  );
}