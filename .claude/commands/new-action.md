Create a new action: $ARGUMENTS

1. Read docs/AI_SYSTEM.md.
2. Define the input schema with Zod in packages/shared/actions.
3. Choose the permission level: read, write, external, or destructive.
4. Implement the handler in apps/server/src/actions, logging to ai_action_log.
5. For write actions, implement undo.
6. Register it in the action registry and the skills that should use it.
7. Write tests for success, invalid input, and permission behavior.
