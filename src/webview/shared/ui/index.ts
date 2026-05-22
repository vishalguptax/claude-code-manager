/**
 * Barrel for the shared UI component library. Each component is a CDD folder
 * with a co-located test and its own index. `registerElements.ts` is infra
 * (custom-element registration, side-effect import) and is intentionally not
 * re-exported here — it is imported directly where its side effect is needed.
 */
export { Button, type ButtonProps } from "./Button";
export {
  ContextMenu,
  type ContextMenuItem,
  type ContextMenuProps,
} from "./ContextMenu";
export { Dropdown, type DropdownOption, type DropdownProps } from "./Dropdown";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { Icon, type IconProps } from "./Icon";
export { Input, type InputProps } from "./Input";
export { ListItem, type ListItemProps } from "./ListItem";
export { Loading } from "./Loading";
export { Modal, type ModalProps } from "./Modal";
export { VirtualList, type VirtualListProps } from "./VirtualList";
