# Compact corner-index revision

This revision supersedes the layout in stacked-layout-notes.md. Concept art only; no application implementation was changed.

The current software's PlayingCard.tsx was inspected: standard cards use an upper-left rank/suit group mirrored at lower right, with no center suit. That card design is the intended production reference.

Selected images:
- images/03-compact-corner-index-play-v4.png
- images/04-compact-dealer-reveal-v4.png

Changes: blank card centers, enlarged corner indices, shallow tightly overlapping fans, and substantially smaller total hand widths. The seven-card fan now leaves broad margins rather than filling the table width. Keep the corner strip exposed instead of preserving each card's blank face. Exact generation geometry is approximate; target 80px card width with roughly 22px step for a seven-card width of 212px at a comparable concept scale. Mirror actual source card typography faithfully during implementation; generated numerals and suit silhouettes are not authoritative assets.

Relics flank the dealer on the left. Challenges flank it on the right with shortened labels and icons after the text, as requested. The central dealer overlaps a face-up card over the face-down card. Remove the previous separate top information band. Slim the header, remove broad row dividers, and keep negative space between dealer, draw, and player rows.

The companion dealer-reveal frame studies fading both side lists and clearing the draw tray. The player's hands and attached totals stay in place. After the outcomes register, the dealer can fade and the local numerical scoring sequence can begin. Do not treat this transition frame as a complete scoring-state design. Prior requirements remain: scoring explanations must stay attached to their originating hand and persist through final review; shared running cash and multiplier must remain understandable.

Generated using the built-in image generation tool. Exact initial prompt: compact-cards-v3-prompts.json. Overlap refinement: compact-cards-v3-refinement.txt. Dealer companion: compact-cards-v3-dealer-prompt.txt. Final targeted corner-print correction prompts: compact-cards-v3-corner-fixes.json. Selected concept images still contain approximate generated lettering rather than production card artwork.
