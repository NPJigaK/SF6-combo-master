# Official Snapshot Validation Checklist

Use this checklist whenever official frame snapshots or generated `moves.master.json` files are updated.

## 1. Diff Review

Run a focused diff before testing:

```powershell
git diff -- data/*/frame.raw.json data/*/moves.master.json
```

Check at least these fields on changed moves:

- `startUpFrame`
- `hitRecovery`
- `blockRecovery`
- `cancel`
- `miscellaneous`
- `supercomboExtras.properties.juggle*`

## 2. Automated Verification

Run the project test suite:

```powershell
pnpm test
```

If web UI rendering changed, also run a production build:

```powershell
pnpm build
```

## 3. Manual Verification

Run the app and validate changed moves in both views:

1. Move Browser:
   - Confirm updated frame values match the expected snapshot.
   - Confirm Supercombo extra fields are still mapped to the correct move.
2. Combo Builder:
   - Confirm step confidence labels (`confirmed` / `candidate` / `unknown`) are shown.
   - Hover the confidence label and verify source and reason text are plausible.

## 4. Merge Criteria

Only merge snapshot updates when all are true:

- Focused diff has no accidental mass rewrites.
- `pnpm test` passes.
- Manual Move Browser and Combo Builder checks are complete.
