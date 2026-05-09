export const REGEX_META = /[.*+?^${}()|[\]\\]/g;

/** `value="…"` on a single HTML tag fragment (Huawei pages use double or single quotes). */
export const INPUT_VALUE_ATTR = /value=["']([^"']*)["']/i;

/**
 * Single- or double-quoted JS string literal, supporting `\x..` and other backslash
 * escapes. Group 1 captures the content of `"…"`; group 2 captures the content of `'…'`.
 */
export const JS_STRING_LITERAL = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;
