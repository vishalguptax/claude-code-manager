/**
 * @deprecated Use <TextField> instead — it is the single canonical text input.
 *
 * `Input` is retained as a name-compatible alias of <TextField> so existing
 * call sites keep compiling after the A2 consolidation (one text input, not
 * two). Importing `Input` now yields the native `<input>`-based <TextField>.
 * `InputProps` is an alias of `TextFieldProps`.
 *
 * New code should import `TextField` directly. Once all call sites are
 * migrated (Phase B), this alias can be deleted.
 */
export { TextField as Input, type TextFieldProps as InputProps } from "../TextField";
