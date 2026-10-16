import { redirect } from "next/navigation";

/** The old "Style rulebook" page now lives on the Review rules page. */
export default function StylePage() {
  redirect("/rules?tab=ai");
}
