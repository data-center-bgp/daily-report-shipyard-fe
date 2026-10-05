import { FileWarning } from "lucide-react";
import Tooltip from "../common/Tooltip";

// Flags a BASTP whose Form Penawaran PDF hasn't been uploaded. The upload is
// one of the two conditions for DRAFT/VERIFIED -> READY_FOR_INVOICE (the other
// is every work detail's materials being submitted), so without this the
// BASTP just sits there with no visible reason.
export default function FormPenawaranMissingBadge({
  onDetailsPage = false,
}: {
  onDetailsPage?: boolean;
}) {
  return (
    <Tooltip
      content={
        <>
          <b className="font-semibold">Form Penawaran not uploaded yet.</b> It's
          a required PDF before this BASTP can become Ready for Invoice.{" "}
          {onDetailsPage
            ? "Upload it in the Form Penawaran section below."
            : "Open the BASTP to upload it."}
        </>
      }
    >
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
        <FileWarning className="h-3 w-3" />
        Form Penawaran missing
      </span>
    </Tooltip>
  );
}
