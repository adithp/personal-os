# Pitfalls: api-route

Lessons for this area (index: docs/LESSONS.md). Add new ones with the record-lesson skill.

### 2026-10: Fastify hooks apply only to the scope they are added in
- Symptom: requireLogin as a nested plugin did not protect sibling routes
- Cause: Hooks are encapsulated per plugin scope
- Fix: requireLogin(app, verifier) is called on the protected scope itself; every route test checks 401
- Prevention: guarded, apps/server/src/routes/v1.ts (requireLogin as a function) and the auth tests on every route
