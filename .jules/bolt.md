## 2024-05-22 - ReactFlow Node Memoization
**Learning:** `ReactFlow` components can trigger unnecessary re-renders of all nodes when the parent component re-renders, even if node data hasn't changed. This is often caused by passing a derived `nodes` array that is recreated on every render (e.g., `nodes.map(...)`).
**Action:** Always memoize the `nodes` and `edges` arrays passed to `ReactFlow` using `useMemo`, and wrap custom node components in `React.memo` to ensure referential stability and prevent wasted render cycles.
