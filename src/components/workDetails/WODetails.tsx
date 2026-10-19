import WODetailsTable from "./WODetailsTable";

export default function WorkOrderDetails() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Work Order Details</h1>
        <p className="text-gray-600">Manage all work orders</p>
      </div>
      <WODetailsTable />
    </div>
  );
}
