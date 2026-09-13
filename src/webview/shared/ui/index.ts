/**
 * Barrel for the shared UI component library. Each component is a CDD folder
 * with a co-located test and its own index. All components are plain Preact
 * over native HTML elements styled by --vscode-* theme vars — no web-component
 * registration, no third-party element library.
 */
export { BackButton, type BackButtonProps } from "./BackButton";
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
export { ErrorBanner, type ErrorBannerProps } from "./ErrorBanner";
export { Field, type FieldProps } from "./Field";
export { Icon, type IconProps } from "./Icon";
export { ListItem, type ListItemProps } from "./ListItem";
export { Loading } from "./Loading";
export { SlowLoadNotice, useLoadPhase, type LoadPhase } from "./LoadDeadline";
export { Menu, type MenuItem, type MenuProps } from "./Menu";
export { Modal, type ModalProps } from "./Modal";
export { ScopeFilter, type ScopeFilterProps, type ScopeOption } from "./ScopeFilter";
export {
  Section,
  SectionHeader,
  type SectionHeaderProps,
  type SectionProps,
} from "./Section";
export { SearchInput, type SearchInputProps } from "./SearchInput";
export { Segmented, type SegmentedOption, type SegmentedProps } from "./Segmented";
export {
  ListSkeleton,
  type ListSkeletonProps,
  Skeleton,
  SkeletonBlock,
  type SkeletonBlockProps,
  SkeletonCircle,
  type SkeletonCircleProps,
  SkeletonLine,
  type SkeletonLineProps,
  SkeletonList,
  type SkeletonListProps,
  type SkeletonProps,
  SkeletonRect,
} from "./Skeleton";
export { ShowMore, type ShowMoreProps } from "./ShowMore";
export {
  StatTile,
  StatTileGrid,
  type StatTileGridProps,
  type StatTileProps,
} from "./StatTile";
export { TextArea, type TextAreaProps } from "./TextArea";
export { TextField, type TextFieldProps, type TextFieldType } from "./TextField";
export { VirtualList, type VirtualListProps } from "./VirtualList";
