import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

export default function DatabaseCleanup() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<any>(null);
  const cleanupOrphanedUsers = useMutation(api.cleanup.cleanupOrphanedUsers);

  const handleCleanup = async () => {
    if (!confirm("Are you sure you want to clean up orphaned user records? This action cannot be undone.")) {
      return;
    }

    setIsRunning(true);
    setResults(null);

    try {
      const result = await cleanupOrphanedUsers();
      setResults(result);
      
      if (result.deleted.length > 0) {
        toast.success(`Successfully deleted ${result.deleted.length} orphaned user(s)`);
      } else {
        toast.info("No orphaned users found");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to cleanup orphaned users");
      console.error("Cleanup error:", error);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Database Cleanup</h2>
      
      <div className="mb-4">
        <p className="text-gray-600 mb-2">
          This tool will identify and remove user accounts that don't have corresponding employee records.
          This includes:
        </p>
        <ul className="list-disc list-inside text-gray-600 space-y-1 ml-4">
          <li>User accounts without employee records</li>
          <li>User accounts without role assignments</li>
          <li>All related shifts, logs, and sessions</li>
        </ul>
        <p className="text-red-600 mt-2 font-medium">
          ⚠️ This action cannot be undone. Make sure you have a backup if needed.
        </p>
      </div>

      <button
        onClick={handleCleanup}
        disabled={isRunning}
        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isRunning ? "Cleaning up..." : "Run Cleanup"}
      </button>

      {results && (
        <div className="mt-6 p-4 bg-gray-50 rounded border">
          <h3 className="font-semibold mb-2">Cleanup Results</h3>
          <div className="space-y-2 text-sm">
            <p>Total users in database: <span className="font-medium">{results.totalUsers}</span></p>
            <p>Orphaned users found: <span className="font-medium">{results.orphanedFound}</span></p>
            
            {results.deleted.length > 0 && (
              <div className="mt-4">
                <p className="font-medium mb-2">Deleted users:</p>
                <ul className="list-disc list-inside space-y-1 text-gray-600">
                  {results.deleted.map((user: any) => (
                    <li key={user.id}>
                      {user.name || "Unnamed"} ({user.email || "No email"})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
