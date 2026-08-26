# Motion

Use this when adding or reviewing animation, transitions, or other interface motion.

## Decide whether motion helps

Default to no motion. Add it only when it serves a user-visible purpose:

- explain a change or preserve spatial continuity
- confirm an action without delaying it
- improve perceived responsiveness
- add occasional delight to an interaction people rarely repeat

Remove motion when a static change communicates just as clearly or the effect merely makes the interface busier.

## Match motion to use

The more often people perform an action, the less motion it should have. Frequent controls should feel immediate rather than ceremonial.

Keyboard navigation, selection, and other repeated input must visibly track each input without transitional lag. This does not forbid every effect initiated from a keyboard; it forbids motion that makes the interface feel behind the user.

Reserve expressive or decorative motion for rare moments where its novelty will not become friction.

## Keep product UI fast

Keep ordinary product UI motion under 300ms as a rule of thumb, and prefer shorter durations for frequent interactions. Treat 300ms as a loose upper bound, not a target.

Motion must not block an action or delay meaningful feedback about its result. State may animate into view when that motion helps explain its arrival. Marketing or explanatory animation may run longer when it helps tell the story and does not block a task.

Use consistent direction and origin so motion reinforces where an element came from and where it went.

## Preserve access and performance

Respect `prefers-reduced-motion`. Do not make motion the only way to understand a state change. Follow the platform's rendering guidance and avoid expensive motion on low-end devices.

Further reading: [You Don't Need Animations](https://emilkowal.ski/ui/you-dont-need-animations) by Emil Kowalski.
