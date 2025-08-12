import WorkOrderTable from "./WorkOrderTable";

export default function WorkOrders() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Work Orders</h1>
        <p className="text-gray-600">Manage all work orders</p>
      </div>
      <WorkOrderTable />
    </div>
  );
}
