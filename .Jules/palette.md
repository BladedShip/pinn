## 2024-05-22 - Editor.js Theming Constraints
**Learning:** Editor.js injects its own styles with high specificity or inline styles, requiring `!important` overrides in global CSS for custom themes (especially dark mode).
**Action:** When styling Editor.js components (popovers, toolbars), always check for existing styles and be prepared to use `!important` to enforce the design system's theme.
