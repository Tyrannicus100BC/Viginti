# Portrait cabinet — stacked hand revision

Concept art only. No game source or HTML implementation changed.

## Source inspection

Inspected the Enmanner-managed current application and these source components on 2026-10-23: ChallengeBoard, ChallengeProgress, RelicInventory, relic inventory rules, engine challenge definitions, and App dealer/draw composition. Current starting passive relic capacity is six, all on the left. Challenges show named metrics and numeric progress; the starting main goal is four rounds, and a starting side goal is four pairs. Further goals can accumulate, including pack challenges. Draw positions expand dynamically for multiple cards. Three example challenge entries in the concept illustrate a populated board rather than the exact opening state.

## Proposed composition

1. Compact cash / round / ante header.
2. Shared upper information band: named relics left, readable challenge descriptions and progress right. The dealer sits below this band rather than competing for a third column.
3. Shallow dealer row.
4. Clearly separated draw tray, demonstrating one card and three simultaneous reveal positions. Three positions illustrate expansion, not a hard limit or a new choose-one mechanic. Empty-position outlines are capacity cues; in an eventual implementation they should not imply three independent draw buttons.
5. Three vertically stacked, full-width player hand rows. Long fans retain every rank and suit index. Blackjack totals stay directly beneath the corresponding fan. Remove all former unexplained right-hand boxes.
6. Physical Stand button plus Hand Scores and Deck utilities. Fingertips only at the frame bottom.

The clean view uses five-, three-, and two-card hands. The busy view uses seven-, five-, and six-card hands with totals 18, 20, and 19, plus a multi-card flip. These are composition examples rather than an exact legal snapshot from a saved run.

## Scoring constraint retained

These pictures depict play and draw reveal, not the scoring sequence. The totals beneath the fans are blackjack totals. When scoring is developed, each hand's numerical explanation must remain attached to its originating row and persist through final review. Do not replace those explanations with a detached central ledger or hide previously scored rows. Local scoring space and the shared running cash/multiplier require a dedicated scoring-state composition; the play pictures alone do not establish that it fits.

## Art direction and eventual Three.js recipe

Use faceted, bevelled cabinet and robot meshes; texture atlases with coherent coarse texel density; point-filtered painted wear; warm amber lights against petrol blue; restrained emissive bloom; and subtle ordered dithering on the scene. Keep screen typography, rank indices, and progress text legible rather than applying destructive full-screen CRT effects. Exact texture sizes and internal render resolution are tuning decisions, not fixed by these concepts.

The card area can be a separate 3D scene rendered to the cabinet display, with actual card thickness, cast shadows, Z separation, and a subdivided card mesh for bends/flips. It should still feel like an interactive virtual 3D table inside a cabinet. Preserve the portrait composition at wide aspect ratios by revealing more environment at the sides. Phone-size type, touch targets, the longest relic names, extra challenges, and scoring density need a subsequent layout validation before implementation; generated lettering is not a production UI specification.

## Outputs

- images/01-stacked-clean-play.png
- images/02-stacked-multiple-draw-long-hands.png
- stacked-revision-prompts.json contains the complete prompts used with the built-in image generation tool and reference filenames.
