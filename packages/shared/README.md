# packages/shared

Shared code for all apps:
- Zod schemas and TypeScript types for every entity
- Action definitions (name, description, input schema, permission)
- Constants: module names, module colors, permission levels, model route names

Apps and the backend import from here. Never redefine these types elsewhere.
