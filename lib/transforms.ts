export type TransformRule =
  | 'uppercase'
  | 'lowercase'
  | 'titlecase'
  | 'extract_email';

const NULL_VALUES = new Set(['null', 'na', 'n/a', '-']);

function isNullValue(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return trimmed === '' || NULL_VALUES.has(trimmed);
}

function toTitleCase(value: string): string {
  return value.replace(
    /\w\S*/g,
    (word) =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function extractEmail(value: string): string {
  const matches = value.match(EMAIL_REGEX);
  return matches ? matches.join(', ') : '';
}

const TRANSFORMERS: Record<
  TransformRule,
  (value: string) => string
> = {
  uppercase: (v) => v.toUpperCase(),
  lowercase: (v) => v.toLowerCase(),
  titlecase: toTitleCase,
  extract_email: extractEmail,
};

export function transformValue(
  value: string,
  rule: TransformRule
): string {
  if (isNullValue(value)) return value;
  const transformer = TRANSFORMERS[rule];
  return transformer ? transformer(value) : value;
}

export function transformColumn(
  rows: Record<string, string>[],
  header: string,
  rule: TransformRule
): Record<string, string>[] {
  return rows.map((row) => ({
    ...row,
    [header]: transformValue(row[header] ?? '', rule),
  }));
}

export const TRANSFORM_LABELS: Record<TransformRule, string> = {
  uppercase: 'Uppercase',
  lowercase: 'Lowercase',
  titlecase: 'Title Case',
  extract_email: 'Extract Email',
};
