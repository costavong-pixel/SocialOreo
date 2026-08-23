import { permanentRedirect } from "next/navigation";

/** Compatibility route for stale links from the pre-canonical shell. */
export default function LegacyPostRoute() {
  permanentRedirect("/posts");
}
