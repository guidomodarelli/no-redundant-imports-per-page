# Analysis Flow

This document shows how the rule tracks duplicate imports inside a single page entry point.

## Example: transitive duplicate

```scss
// page/styles.scss
@import 'A';
@import 'B';
```

```scss
// A.scss
@import 'Shared';
```

```scss
// B.scss
@import 'Shared';
```

The dependency tree for that page looks like this:

```text
page/styles.scss
├── A.scss
│   └── Shared.scss
└── B.scss
    └── Shared.scss
```

The rule runs a DFS from the page entry point and keeps a per-page `firstSeen` map.

Initial state:

```text
firstSeen:
- page/styles.scss -> <entry>
```

After visiting `A.scss`:

```text
firstSeen:
- page/styles.scss -> <entry>
- A.scss -> imported from page/styles.scss
```

After visiting `Shared.scss` through `A.scss`:

```text
firstSeen:
- page/styles.scss -> <entry>
- A.scss -> imported from page/styles.scss
- Shared.scss -> imported from A.scss
```

After visiting `B.scss`:

```text
firstSeen:
- page/styles.scss -> <entry>
- A.scss -> imported from page/styles.scss
- Shared.scss -> imported from A.scss
- B.scss -> imported from page/styles.scss
```

When the traversal reaches `Shared.scss` again through `B.scss`, the file already exists in `firstSeen`, so the rule reports a redundant import.

Visual summary:

```text
page/styles.scss
├── A.scss
│   └── Shared.scss   <- first time, stored in firstSeen
└── B.scss
    └── Shared.scss   <- second time, reported as redundant
```

## Example: cycle detection

```scss
// page/styles.scss
@import 'CycleA';
```

```scss
// CycleA.scss
@import 'CycleB';
```

```scss
// CycleB.scss
@import 'CycleA';
```

The dependency tree looks like this:

```text
page/styles.scss
└── CycleA.scss
    └── CycleB.scss
        └── CycleA.scss
```

The rule uses two structures here:

- `firstSeen`: records the first time a stylesheet appears in the current page tree
- `activeStack`: records which stylesheets are still active in the current DFS branch

When `CycleB.scss` reaches `CycleA.scss` again:

- `CycleA.scss` is already in `firstSeen`, so the import is redundant
- `CycleA.scss` is also still in `activeStack`, so the rule marks it as a cycle

Short version:

```text
firstSeen = already appeared before in this page tree
activeStack = still active in the current branch, so this is a cycle
```
