import { useQuery } from "@tanstack/react-query";
import FileUploadSimple from './FileUploadSimple';
import type { User } from '@shared/api-types';

export default function Dashboard() {
  const { data: user } = useQuery<User>({
    queryKey: ['/api/auth/user'],
    retry: false
  });
  
  const isAdmin = user?.role === 'admin';

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-6 lg:px-8">
      <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-gray-900 dark:text-gray-100 text-center sm:text-left">
        UK Certificate of Sponsorship Verifier
      </h1>
      
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-4 sm:p-6 mb-4 sm:mb-6">
        <h2 className="text-base sm:text-lg font-medium mb-3 sm:mb-4 text-gray-900 dark:text-gray-100 text-center sm:text-left">Upload Your UK CoS Document</h2>
        <FileUploadSimple 
          restrictToOneCheck={!isAdmin} 
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}