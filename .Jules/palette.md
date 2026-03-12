## 2024-03-12 - Accessible Data Tables
**Learning:** React table headers (`<th>`) often rely on `onClick` handlers directly on the cell for sorting, which screen readers ignore. Applying `role="button"` directly to `<th>` overrides its semantic `columnheader` role, degrading the experience.
**Action:** Always wrap the sortable content inside a `<th>` with a native `<button>` element. This preserves the column header semantics while natively providing keyboard accessibility (Tab, Enter, Space) without custom keydown handlers.
