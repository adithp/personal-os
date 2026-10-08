# discuss: pitfalls

- A context file can go stale (it once said Liquid Glass was "not started" after it was built). Check CONTEXT.md claims against the code and docs, and list conflicts instead of trusting it.
- `docs/prompts/**` and `docs/design/mockups/**` are in the doc-map ignore list; ROADMAP.md and DECISIONS.md changes need a CONTEXT.md update (or `[docs-ok]`).
- Prompts must say what not to do, include the stop rule and "never read or edit .env files".
