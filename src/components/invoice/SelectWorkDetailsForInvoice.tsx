import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";

interface Props {
  workOrderId: number;
  onWorkDetailsSelected: (selectedWorkDetailsIds: number[]) => void;
}

interface WorkDetailsForInvoice {
  id: number;
  description: string;
  location: string;
  pic: string;
  is_completed: boolean;
  is_invoiced: boolean;
}

export default function SelectWorkDetailsForInvoice({
  workOrderId,
  onWorkDetailsSelected,
}: Props) {
  const [workDetails, setWorkDetails] = useState<WorkDetailsForInvoice[]>([]);
  const [selectedDetails, setSelectedDetails] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAvailableWorkDetails();
  }, [workOrderId]);

  const fetchAvailableWorkDetails = async () => {
    try {
      // Get work details with their invoice status
      const { data: workDetailsData, error } = await supabase
        .from("work_details")
        .select(
          `
          id,
          description,
          location,
          pic,
          actual_close_date,
          invoice_work_details (
            id,
            invoice_details_id
          )
        `
        )
        .eq("work_order_id", workOrderId)
        .is("deleted_at", null);

      if (error) throw error;

      const processedWorkDetails = workDetailsData.map((detail) => ({
        id: detail.id,
        description: detail.description,
        location: detail.location,
        pic: detail.pic,
        is_completed: !!detail.actual_close_date,
        is_invoiced:
          detail.invoice_work_details && detail.invoice_work_details.length > 0,
      }));

      setWorkDetails(processedWorkDetails);
    } catch (error) {
      console.error("Error fetching work details:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDetailSelection = (detailId: number, checked: boolean) => {
    if (checked) {
      setSelectedDetails((prev) => [...prev, detailId]);
    } else {
      setSelectedDetails((prev) => prev.filter((id) => id !== detailId));
    }
  };

  const handleConfirmSelection = () => {
    onWorkDetailsSelected(selectedDetails);
  };

  const availableDetails = workDetails.filter((detail) => !detail.is_invoiced);

  if (loading) {
    return <div>Loading work details...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 p-4 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">
          Select Work Details for Invoice
        </h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="font-medium">Total Work Details:</span>{" "}
            {workDetails.length}
          </div>
          <div>
            <span className="font-medium">Completed:</span>{" "}
            {workDetails.filter((d) => d.is_completed).length}
          </div>
          <div>
            <span className="font-medium">Already Invoiced:</span>{" "}
            {workDetails.filter((d) => d.is_invoiced).length}
          </div>
        </div>
      </div>

      {/* Work Details List */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 font-medium">
          Available Work Details ({availableDetails.length})
        </div>

        <div className="max-h-96 overflow-y-auto">
          {availableDetails.map((detail) => (
            <div
              key={detail.id}
              className={`border-b p-4 ${
                !detail.is_completed ? "bg-gray-50" : ""
              }`}
            >
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  disabled={!detail.is_completed}
                  checked={selectedDetails.includes(detail.id)}
                  onChange={(e) =>
                    handleDetailSelection(detail.id, e.target.checked)
                  }
                  className="w-4 h-4"
                />

                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{detail.description}</p>
                      <p className="text-sm text-gray-600">
                        Location: {detail.location} | PIC: {detail.pic}
                      </p>
                    </div>
                    <div className="flex space-x-2 text-xs">
                      <span
                        className={`px-2 py-1 rounded ${
                          detail.is_completed
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {detail.is_completed ? "Completed" : "In Progress"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      {selectedDetails.length > 0 && (
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-medium text-green-900">
                Selected: {selectedDetails.length} work details
              </p>
              <p className="text-sm text-green-700">
                These work details will be included in this invoice.
              </p>
            </div>
            <button
              onClick={handleConfirmSelection}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
            >
              Continue with Selected Details
            </button>
          </div>
        </div>
      )}

      {availableDetails.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No work details available for invoicing.</p>
          <p className="text-sm">
            All work details have already been invoiced.
          </p>
        </div>
      )}
    </div>
  );
}
