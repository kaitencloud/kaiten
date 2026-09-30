import type { ZodType } from 'zod';

/**
 * Validate `value` against the OpenAPI-generated Zod schema and return it
 * **with its original TypeScript type preserved**.
 *
 * Why we do not return `z.infer<TSchema>`: the generated Zod schemas use
 * `readonly()`, `.nullish()` and `bigint` in places where the generated
 * TypeScript types use `mutable arrays`, plain `optional` and `number`. Zod
 * treats these as the same shape at runtime but TypeScript does not. By
 * keeping the input type, callers avoid spurious cast-shaped friction while
 * still benefiting from the runtime guarantee.
 *
 * The contract here is **runtime validation, not type widening**: if the
 * shape passes Zod, the original TS type already accepted it.
 */
export function parseContract<T>(schema: ZodType, value: T, label: string): T {
  const result = schema.safeParse(value);

  if (result.success) {
    return value;
  }

  const issues = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
      return `${path}: ${issue.message}`;
    })
    .join('; ');

  throw new Error(`${label} does not match the OpenAPI contract: ${issues}`);
}
