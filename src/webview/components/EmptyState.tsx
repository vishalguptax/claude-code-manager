/**
 * Reusable empty-state card with optional icon, description, and slot.
 */
import type { ComponentChildren } from "preact";
import { Icon } from "./Icon";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: string;
  children?: ComponentChildren;
}

export function EmptyState({ title, description, icon, children }: EmptyStateProps) {
  return (
    <div class="empty-state">
      {icon ? <Icon name={icon} size={32} /> : null}
      <div class="empty-state-title">{title}</div>
      {description ? <div class="empty-state-desc">{description}</div> : null}
      {children}
    </div>
  );
}
