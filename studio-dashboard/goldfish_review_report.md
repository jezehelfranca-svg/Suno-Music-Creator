# Studio dashboard review

Reviewed revision `5f3d65be6b0bce11436c01ff756a3a26c389e386`.

| Review phase | Result |
| --- | --- |
| Workflow and intent | Independent reviewers traced the inbox, stem prep, MIDI, render, and DAW handoff against the README. |
| Design, code, structure, and terminology | Reviewers reproduced title-dependent bus routing, shifted layered MIDI, false drum triggers, and seed dependence on Python hash order. They also identified stale rebuild markers and inaccurate A/B labels. |
| Revised workflow | Layer playback and export use the same note list. Swing controls distinguish Layer from Original, where Swing affects the exported MIDI. |
| Readiness | Independent review requested a hold over source preservation and obsolete MIDI and triggers. The patch addresses those findings. The final independent recheck was unavailable due to the reviewer usage limit. |

For example, the original routed all four Vox Pop stems to vocals. In a layered example at 120 BPM, a hat rendered at 625 ms could be exported around 667 ms. Separate regression cases cover role classification, original offsets, coincident drum samples, and quiet kick bleed.

The watcher stages changed stems before replacing them, preserves newer manual imports, and rebuilds derived outputs on a newer same-size inbox revision. Replacing inbox stems via HTTP archives their previous routed copies. Reprocessing retires obsolete drum or bass MIDI and removes previously misclassified trigger outputs for current non-drum stems.

Validation used synthetic audio and temporary pipeline folders. All 54 dashboard tests passed. The stem preparation suite passed 44 tests and skipped 13 on this configuration. Both inline dashboard scripts passed Node syntax checks. FL Studio playback and listening tests on a real song remain unverified. The trigger bleed check uses the signal present in the trigger files and cannot recover level differences removed upstream. Replacing several staged files is atomic per file only. The comparison players use each file's saved loudness.
