import WODetailsTable from "./WODetailsTable";
import { useWorkSection } from "../../hooks/useWorkSection";

export default function WorkOrderDetails() {
  const { isNewBuilding } = useWorkSection();
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Work Order Details</h1>
        <p className="text-gray-600">
          Work details of {isNewBuilding ? "new building" : "docking and repair"}{" "}
          work orders
        </p>
      </div>
      <WODetailsTable />
    </div>
  );
}
