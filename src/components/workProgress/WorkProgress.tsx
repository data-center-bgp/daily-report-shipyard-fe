import { useParams } from "react-router-dom";
import WorkProgressTable from "./WorkProgressTable";

export default function WorkProgressPage() {
  const { workDetailsId } = useParams();

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Work Progress</h1>
        <p className="text-gray-600">
          {workDetailsId
            ? `Track progress reports for work details #${workDetailsId}`
            : "Track and manage progress reports across all work details"}
        </p>
      </div>
      <WorkProgressTable
        workDetailsId={workDetailsId ? parseInt(workDetailsId) : undefined}
        embedded={false}
      />
    </div>
  );
}
