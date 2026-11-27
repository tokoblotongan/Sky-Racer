# Arena Template (`src/arenas/_template/`)

This directory contains minimal starter templates for creating a new Sky Racer arena.

Do **not** import or register `_template` directly in `src/arenas/index.ts`. Use the generator script instead:

```bash
npm run new:arena -- desert-canyon "Desert Canyon"
```

Generated files:
1. `src/arenas/<id>/course.ts` — Track segments, width, start pose, checkpoints, boost pads, and medal targets (`ArenaCourseData`).
2. `src/arenas/<id>/theme.ts` — World scenery builder, sky colors, and lighting profile (`ThemeDefinition`).
3. `src/arenas/<id>/definition.ts` — Full `ArenaDefinition` entry (starts with `comingSoon: true`).
4. `src/arenas/index.ts` — Updated automatically between `// ARENA-REGISTRY-START` and `// ARENA-REGISTRY-END`.

See `/docs/ARENA_KIT.md` for full design rules and validation commands.
