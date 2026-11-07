import { notFound } from "next/navigation";
import { TUNING } from "@/components/tuning";
import { HapticsTest } from "./HapticsTest";

/** A page for trying out haptics on real phones (development only): which ways of making the phone tick work where. */
export default function Page() {
  if (!TUNING) notFound();
  return <HapticsTest />;
}
