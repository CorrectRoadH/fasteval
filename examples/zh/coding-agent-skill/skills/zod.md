---
name: zod
description: Use this skill whenever you need to validate user input, API request bodies, environment variables, config files, or any external data at runtime. Apply it when the task involves parsing untrusted data, schema definition, or runtime type checking in TypeScript.
---

# Zod Validation Expert

Guidance for using Zod for runtime validation in TypeScript projects.

## When to Use Zod

- API request and response body validation
- Environment variable and config file parsing
- Data from external sources (databases, files, third-party APIs)
- Anywhere you need both a TypeScript type AND a runtime check — let `z.infer<>` derive the type from the schema

## Core Patterns

### Schema Definition

Define schemas with `z.object()`. Export the inferred TypeScript type alongside the schema.

```ts
import { z } from "zod";

export const UserSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["admin", "user", "guest"]),
});

export type User = z.infer<typeof UserSchema>;
```

### Safe Parsing (Preferred at Runtime Boundaries)

Always use `.safeParse()` in route handlers and config loaders — it never throws:

```ts
const result = UserSchema.safeParse(requestBody);
if (!result.success) {
  return res.status(422).json({ errors: result.error.issues });
}
// result.data is typed as User — no cast needed
const user = result.data;
```

### When to Use `.parse()` vs `.safeParse()`

- `.safeParse()` — default in any runtime path; caller decides how to handle the error
- `.parse()` — only in tests or CLI scripts where throwing is acceptable

### Environment Variable Validation

```ts
const EnvSchema = z.object({
  PORT: z.string().regex(/^\d+$/).transform(Number),
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export const env = EnvSchema.parse(process.env);
```

### Optional and Default Fields

```ts
const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});
```

### Nested Objects and Arrays

```ts
const OrderSchema = z.object({
  id: z.string().uuid(),
  items: z.array(
    z.object({
      productId: z.string(),
      qty: z.number().int().min(1),
    })
  ).min(1),
  shipping: z.object({
    address: z.string(),
    city: z.string(),
  }),
});
```

### Discriminated Unions

```ts
const EventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("click"), x: z.number(), y: z.number() }),
  z.object({ type: z.literal("keydown"), key: z.string() }),
]);
```

### Reusable Middleware (Express)

```ts
function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(422).json({ errors: result.error.issues });
    }
    req.body = result.data;
    next();
  };
}
```

## Anti-patterns to Avoid

- Do NOT use `JSON.parse()` without validating the result
- Do NOT use `as unknown as T` or `as T` casts — use `z.infer<>` instead
- Do NOT use `.parse()` in route handlers (throws; error lands in uncaught handler)
- Do NOT write manual type guards (`if (typeof x.id === "number" && ...)`) — Zod does this
- Do NOT use `any` for parsed data — `z.infer<typeof Schema>` gives the correct type

## Error Formatting

```ts
if (!result.success) {
  const formatted = result.error.format();
  // formatted._errors — top-level errors
  // formatted.email?._errors — field-level errors
}
```
