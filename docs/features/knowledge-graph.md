# Knowledge graph

## Purpose
See how everything connects.

## Data
GET /graph returns nodes (entities) and edges (links). Node color = module color from docs/DESIGN.md.

## Features
- Global graph and local graph (around one item, depth 1–3).
- Zoom, pan, select nodes, open an item from its node.
- Filter by type (notes, tags, projects, tasks, people, files) and by relation.
- Search the graph.
- Built with Sigma.js + graphology, force layout.

## AI
graph.related finds connections, for example "Find connections between my Python and cybersecurity notes."

## Done when
Notes like Python → Django → REST API → Authentication appear connected and I can explore them.
