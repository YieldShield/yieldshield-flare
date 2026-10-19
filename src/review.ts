import { useEffect, useRef } from "react";
import { createReviewScope } from "./lifecycle.mjs";
/** Late reads and delayed approvals cannot revive an obsolete or unmounted review. */
export function useReviewGuard(values: unknown[]) {
  const scope = useRef(createReviewScope());
  scope.current.update(JSON.stringify(values));
  useEffect(() => {
    scope.current.mount();
    return () => scope.current.dispose();
  }, []);
  return () => scope.current.capture();
}
