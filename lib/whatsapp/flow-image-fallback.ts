/**
 * A valid 1x1 transparent PNG for native Flow image fields. Keep this free of
 * database, font, and native-image dependencies so recovery can always use it.
 * The store-picker tests decode the pixels, not just the PNG header.
 */
export const FLOW_FALLBACK_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQImWNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==";
