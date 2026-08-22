import { TutorSession } from "@/components/tutor-session";

// The CSP nonce is per request, so this page cannot be prerendered: a static
// shell would ship scripts without a nonce and never hydrate.
export const dynamic = "force-dynamic";

export default function Page() {
  return <TutorSession />;
}
