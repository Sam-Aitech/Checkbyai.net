import FileUploadSimple from './FileUploadSimple';

export default function DashboardClean() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-foreground">Certificate of Sponsorship Verifier</h1>

      <div className="theme-card p-6">
        <h2 className="text-lg font-medium mb-4 text-foreground">Upload COS Document</h2>
        <FileUploadSimple />
      </div>
    </div>
  );
}