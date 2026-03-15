## 2024-03-12 - Accessible Data Tables
**Learning:** React table headers (`<th>`) often rely on `onClick` handlers directly on the cell for sorting, which screen readers ignore. Applying `role="button"` directly to `<th>` overrides its semantic `columnheader` role, degrading the experience.
**Action:** Always wrap the sortable content inside a `<th>` with a native `<button>` element. This preserves the column header semantics while natively providing keyboard accessibility (Tab, Enter, Space) without custom keydown handlers.

## 2024-05-15 - Dynamic ARIA labels for toggle buttons
**Learning:** Static `aria-label`s on toggle buttons (e.g., `aria-label="Toggle sidebar"`) are ambiguous for screen reader users because they don't convey the current state or the intended action. Screen reader users can't see visual cues (like an icon changing from a hamburger menu to an X).
**Action:** Use dynamic `aria-label`s that describe the action that will occur when clicked (e.g., `aria-label={isOpen ? "Close sidebar" : "Open sidebar"}`). Combine this with `aria-expanded={isOpen}` to communicate the current state of the controlled region, and link them with `aria-controls`. Also, hide decorative icons using `aria-hidden="true"`.

## 2024-05-15 - ARIA Label anti-patterns
**Learning:** Overriding visible text with `aria-label` completely replaces the accessible name of the element. This violates WCAG 2.5.3 (Label in Name) because users who rely on voice control or dictation will try to interact with the button by saying the visible text, but the system won't recognize it. Additionally, if an element has an `aria-label`, screen readers will generally ignore any nested elements with `aria-label`s.
**Action:** When a button contains visible text (e.g., a username), do not use `aria-label` to add state/action information unless the visible text is included in the label. Alternatively, use a visually hidden `<span>` (e.g., `<span className="sr-only">Open menu</span>`) to add descriptive text without overriding the visible name. For badges with counts inside an icon button, include the count in the parent's `aria-label` instead of applying an `aria-label` to the badge itself.
