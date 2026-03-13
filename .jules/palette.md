## 2024-05-18 - Added ARIA labels to icon-only buttons
**Learning:** Icon-only buttons (like `Edit2`, `Trash2`, `X`) within dynamic lists or modals often lack accessible names, making them unusable for screen readers.
**Action:** Always verify icon-only `<button>` elements have a descriptive `aria-label` attribute.