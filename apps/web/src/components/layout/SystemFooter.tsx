import { LifeBuoy } from "lucide-react";
import type { MouseEvent } from "react";

import { systemMetadata } from "@/config/system-metadata";

interface SystemFooterProps {
  compact?: boolean;
  showSupportLink?: boolean;
}

export function SystemFooter({ compact = false, showSupportLink = true }: SystemFooterProps) {
  const supportPath = "/support";

  function navigateToSupport(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (window.location.pathname !== supportPath) {
      window.history.pushState(null, "", supportPath);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }

  return (
    <footer className={compact ? "system-footer is-compact" : "system-footer"}>
      <span>{systemMetadata.poweredBy}</span>
      <span>{systemMetadata.productFamily}</span>
      <span>v{systemMetadata.version}</span>
      {showSupportLink ? <a href={supportPath} className="system-footer-link" onClick={navigateToSupport}>
        <LifeBuoy className="size-4" aria-hidden={true} />
        <span>Soporte</span>
      </a> : null}
    </footer>
  );
}
