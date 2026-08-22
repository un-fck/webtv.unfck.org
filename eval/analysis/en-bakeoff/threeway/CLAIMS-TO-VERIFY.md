# Claims made by the six three-way reading agents, to be verified or refuted

Each claim below was asserted by a reading agent about a specific packet in
/Volumes/SSDAStorage/un-en-bakeoff/threeway/. Verify each against the packet text
itself (grep is fine here — this is verification, not the qualitative read).

Mark each: CONFIRMED / REFUTED / PARTIALLY CORRECT (with the correction).

## AssemblyAI (arm B, section "########## B." in each packet) — alleged fabrications

1. S_PV.10100: AssemblyAI emits "ESKAT" — an acronym that does not exist — in the
   phrase "and to ESKAT, the Secretariat of the Council". Claim: invented entity.
2. S_PV.10069: AssemblyAI emits "Thank you, President Barroso." Claim: a named
   person fabricated who is not otherwise in the meeting.
3. S_PV.10069: AssemblyAI emits "the High Representative" where the PV has
   "Special Representative of the Secretary-General" for Children and Armed
   Conflict, and Azure has "SRSG".
4. S_PV.9826: AssemblyAI emits "UNRWA" where the PV has "UNDOF", inside the
   quoted operative text about the area of separation.
5. S_PV.9826: AssemblyAI emits "UNDORF" at "full support ... and its peacekeepers".
6. S_PV.10054: AssemblyAI emits "Any further discussion" inside the rule-37
   invitation sentence ("invite the representative of Egypt to participate ...").
7. S_PV.10054 and S_PV.9826: AssemblyAI emits a standalone "Aye." during a
   show-of-hands vote, which Azure does not.
8. S_PV.10100: AssemblyAI writes "report TO the Secretary-General" (twice) where
   the PV and Azure have "report OF the Secretary-General".
9. S_PV.9826: AssemblyAI writes "Major General Anita Asma" where the PV and Azure
   have "Asmah".

## Azure (arm C) — alleged failures

10. S_PV.9826: Azure never once renders "UNDOF" correctly; it produces INDOF,
    Ndoff, ANDOF, and one outright omission — 0 of 4 correct.
11. S_PV.10069: Azure emits "the sanctuary" where the PV has "the sanctions regime".
12. S_PV.10069: Azure emits "the panel of expert regional partners" where the PV
    has "the Panel of Experts, regional partners".
13. S_PV.10156 and S_PV.10100: Azure emits "****" (already independently
    confirmed — just verify the surrounding text matches what was reported).
14. S_PV.10100: Azure invents a second speaker turn containing "Against." and
    "Yes." during a show-of-hands vote.

## Cross-cutting claims to test

15. Claim: AssemblyAI's errors are systematically MORE plausible/undetectable and
    Azure's systematically MORE visible. Assess whether the evidence actually
    supports this, or whether it is an artifact of which errors the agents chose
    to highlight. Look for counter-examples in BOTH directions — e.g. Azure
    errors that are fluent and undetectable, and AssemblyAI errors that are
    obvious garble.
16. Claim (made repeatedly): where B and C AGREE against the PV, the PV is the
    edited party and the transcribers are right. Spot-check 5 such cases. Is this
    reasoning sound, or are there cases where both transcribers share a genuine
    error?
17. Several agents reported "0 unaccounted PV words" in their conservation
    checks. Spot-check ONE of these arithmetically. Are the conservation checks
    real, or reported-as-complete without being complete?
