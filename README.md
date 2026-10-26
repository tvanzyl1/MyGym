# MyGym

## Run And Deploy

MyGym is a dependency-free static app. Open `index.html` directly for local use, or publish it with the included GitHub Actions workflow. In GitHub, open **Settings → Pages**, set the build and deployment source to **GitHub Actions**, then merge a pull request into `main` (or push directly to `main`). The workflow publishes the repository root automatically; it can also be run manually from the Actions tab. The app uses relative asset paths and works from a project subpath.

On the first successful HTTPS visit, the service worker caches the app shell so it can be reopened offline. `file://` use does not enable service workers. Workout data is saved only in this browser's local storage; it does not sync between devices or require an account.

Use **Plan setup** to add exercises and assign them to weekdays. Log reps and optional kilograms in **Workout**; set edits save as you type. Mark each set done as you complete it, then complete the exercise once every set is checked. In Plan setup, export a JSON backup before clearing browser data or moving to another device. Importing a backup replaces the data in the current browser. The saved data envelope is versioned (`schemaVersion: 1`).

## Product Behavior

Build a phone-first workout tracker for following a weekly gym routine, recording sets, and applying a simple weight progression. The first release should be a static website that works without an account or server.

## Platform And Storage

- Host the site on GitHub Pages. Keep the app client-side and avoid server-only features, secrets, or required APIs.
- Store the workout plan and history in the browser's `localStorage`. This is a good fit for a single-user, static site: it works offline after the site has loaded and requires no account or hosting service.
- Explain that local data is tied to the current browser and device and can be lost if browser data is cleared. Add JSON export and import so the user can make backups and move data between browsers. Do not imply that data automatically syncs across devices.
- Version the saved data format so future app updates can migrate existing data.

## Screens And Workflows

### Home / Workout

- Show today's workout, or a clear rest-day state when no exercises are scheduled for today.
- Let the user open another weekday's plan and view its exercises.
- For each exercise, show its focus area, name, description, and planned sets.
- On an exercise's first workout, show empty reps and weight fields. Let the user add sets and enter reps and weight for each set; weight is optional where it does not apply.
- Save a workout as the user records it, track completion for each individual set, and allow an exercise to be completed only after all of its sets are marked done. Provide clear actions to finish, skip an exercise, or miss the whole day's workout.

### Admin / Plan Setup

- Create, edit, and remove exercises. Each exercise has a focus area (for example chest, back, triceps, biceps, legs, or stomach), a name, and a description.
- Assign exercises to weekdays. Any weekday can have no exercises; for example, a routine may run on Monday, Wednesday, and Friday only.
- Set the initial number of sets for an exercise on a weekday. The user can add or remove sets from that weekday's plan.
- Keep plan editing distinct from workout history: removing a planned set should not erase previously recorded sessions.

## Workout And Progression Rules

Treat each exercise on each weekday as its own progression track, so the same exercise can have separate targets on different workout days.

| Situation | Next scheduled workout for that exercise and weekday |
| --- | --- |
| First time doing the exercise | Start with the planned sets and blank reps and weight fields. |
| Completed workout | Prefill the same sets and reps from the most recent completed workout; increase each recorded weight by 2.5 kg. |
| One skipped occurrence | Keep the previous target unchanged; do not add weight on the next attempt. |
| Two consecutive skipped occurrences | Reduce the previous target weight by 2.5 kg on the next attempt. |
| A set is removed from the weekday plan | Do not show that set in future sessions for that weekday unless the user adds a set again. |

“Skip exercise” skips only that exercise; “miss day” skips all exercises scheduled for that day. Track skips against scheduled occurrences, not calendar days with no workout planned. A completed workout resets the consecutive-skip count for its exercise/day progression track. The implemented defaults are a 2.5 kg increase per weighted set after completion, no change after one skipped occurrence, and a 2.5 kg reduction after two consecutive skips.

For weightless exercises, retain reps and leave weight blank. Do not apply a kilogram increase to a blank weight. Validate numeric inputs and prevent a reduction from producing a negative weight.

## Suggested Data Model

- **Exercise:** stable ID, focus area, name, description.
- **Weekly plan entry:** weekday, exercise ID, and planned set count (or set definitions if sets need individual labels).
- **Workout session:** date, weekday, completion or missed status, and recorded exercises.
- **Recorded exercise:** exercise ID, status, and ordered sets containing reps and optional weight in kilograms.
- **Progression state:** keyed by exercise and weekday, derived from session history or stored alongside it, including the consecutive skipped-occurrence count.
- **App data envelope:** schema version plus exercises, plan, sessions, and progression data.

Prefer session records as the history of what actually happened; derive the next workout's defaults from the latest completed record and the progression state. This keeps plan changes from rewriting past workouts.

## Visual Direction

- Design mobile-first for quick use between sets, with large tap targets, readable labels, and minimal typing.
- Use an unmistakable 1980s retro-futurist direction: dark night-sky surfaces, electric neon accents, grid or Memphis-inspired geometry, and restrained glow effects. Keep body text high-contrast and comfortably readable rather than sacrificing usability for the aesthetic.
- Use a compact, persistent navigation pattern for Home and Admin. Keep workout actions and set entry prominent; decorative graphics must not compete with logging a set.
- Support narrow screens, keyboard navigation, visible focus states, and reduced-motion preferences.

## Implementation Notes

- The app is plain HTML, CSS, and JavaScript; there is no build step or server-side component.
- The service worker caches the HTML, stylesheet, and app script on HTTPS. Browser-local workout data remains separate from the static cache.
- Keyboard focus states, narrow-screen layouts, reduced-motion preferences, non-negative numeric inputs, and JSON import validation are included.
- The weekly plan is editable independently of saved session snapshots, so past sessions are not rewritten when a plan changes.

## Initial Acceptance Checks

- A new user can create an exercise and schedule it on selected weekdays without being forced to schedule every day.
- The first session for an exercise/day has blank reps and weight; sets can be added and removed.
- A later completed session is prefilled from the prior completed session and follows the confirmed 2.5 kg progression rule.
- Skipping an exercise or an entire scheduled day changes the next progression exactly as specified above; unscheduled rest days do not count as skips.
- Removing a planned set keeps it out of future sessions for that weekday, and adding a set restores it.
- Data survives a reload in the same browser, can be exported and imported, and remains usable from a GitHub Pages deployment path.
