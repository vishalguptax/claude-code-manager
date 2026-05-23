/**
 * Barrel for the shared UI component library. Each component is a CDD folder
 * with a co-located test and its own index. `registerElements.ts` is infra
 * (custom-element registration, side-effect import) and is intentionally not
 * re-exported here — it is imported directly where its side effect is needed.
 */
export { Badge, type BadgeProps, type BadgeVariant } from "./Badge";
export { Button, type ButtonProps, type ButtonVariant } from "./Button";
export { Checkbox, type CheckboxProps } from "./Checkbox";
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
export { Menu, type MenuItem, type MenuProps } from "./Menu";
export { Modal, type ModalProps } from "./Modal";
export { ScopeFilter, type ScopeFilterProps, type ScopeOption } from "./ScopeFilter";
export { SearchInput, type SearchInputProps } from "./SearchInput";
export { Segmented, type SegmentedOption, type SegmentedProps } from "./Segmented";
export { TextField, type TextFieldProps, type TextFieldType } from "./TextField";
export { VirtualList, type VirtualListProps } from "./VirtualList";
