import WODetailsTable from "./WODetailsTable";
import { pageShell } from "../common/ledgerUi";

export default function WorkOrderDetails() {
  return (
    <div className={pageShell}>
      <WODetailsTable />
    </div>
  );
}
