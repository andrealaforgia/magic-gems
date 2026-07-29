Feature: Hardening against forged-sequence poisoning (MP-SEQ-HARDEN)
  As two players in a match
  I want a forged update from a third party to never derail my own genuine play
  So a single malicious request can never silently and permanently desync my opponent's view of me

  Background:
    Given two independent pages are both at the multiplayer lobby's name entry step
    When the first page enters the name "Alice" and generates a code
    And the second page enters the name "Bob" and enters that same code
    Then the match begins on both pages
    Given I record the first page's own sent snapshot payloads
    And I locate an adjacent swap that would produce a match on the first page's local match board
    When I commit that swap on the first page's local match board
    Then the first page's local match score has increased
    And the second page's remote match board and score eventually reflect the first page's own local board and score

  # A forged request, sent directly against this same live match's own
  # session (not through the first page's own genuine send path at all),
  # claims an implausibly-far-ahead sequence as Alice. Before this hardening,
  # the bounded-wait skip-ahead would have adopted it, permanently discarding
  # every one of Alice's own genuine subsequent updates as stale. Proves it
  # is refused outright, and that Alice's own real, continued play keeps
  # syncing to Bob exactly as if the forgery had never been attempted.
  @E1 @E2 @E6 @integration
  Scenario: A forged implausible-sequence update is refused, and the real player's own continued play keeps syncing normally
    When the first page injects a crafted snapshot with sequence 1000, board fill "yellow-diamond", and score 999
    Then the injected snapshot is refused, not accepted
    Given I locate an adjacent swap that would produce a match on the first page's local match board
    When I commit that swap on the first page's local match board
    Then the first page's local match score has increased
    And the second page's remote match board and score eventually reflect the first page's own local board and score

  # SPEC 13.4.2/E3: this hardening must not weaken genuine gap recovery - a
  # real dropped update (never forged, simply never sent) still recovers
  # silently via the same bounded-wait skip-ahead, and local play is
  # unaffected throughout.
  @E3 @E4 @E6 @integration
  Scenario: A genuinely dropped (not forged) update still recovers silently, without freezing local or remote play
    When the first page injects a crafted snapshot with sequence 3, board fill "silver-octagon", and score 700
    Then the second page's remote match board and score eventually show board fill "silver-octagon" and score 700
    And no error or failure state is shown on either page
    Then the first page can still make a fresh move that increases its own local score

  # MP-SEQ-HARDEN (reopened): the plain gap check alone is a RATCHET, not a
  # bound - it's checked against the current expected sequence, a value the
  # attacker's own accepted jumps advance, so a single individually-plausible
  # forged jump can be repeated to walk the expected sequence forward without
  # limit. The first round below is accepted on its own (nothing wrong with
  # one modest jump in isolation) - the second repeat of the same-sized jump
  # is what must fail. Two independent mechanisms guard this now (the
  # elapsed-time ceiling and the cumulative skip-advance budget, added in
  # later rounds of this same hardening) - this only asserts the combined,
  # observable outcome, not which one fires, since either is a valid closure
  # of the same repeated-attack gap.
  @E1 @E6 @integration
  Scenario: Repeating a modest forged jump cannot walk the expected sequence forward without limit
    Given a real 5 second delay passes
    When the first page injects a crafted snapshot with sequence 21, board fill "yellow-diamond", and score 400
    Then the injected snapshot is accepted, not refused
    Given a real 5 second delay passes
    When the first page injects a crafted snapshot with sequence 42, board fill "silver-octagon", and score 800
    Then the injected snapshot is refused, not accepted

  # MP-SEQ-HARDEN (reopened again): the elapsed-time ceiling above closes the
  # single-request exploit and the walk-forward-without-limit repetition,
  # but its own growth rate matches the client's send GATE (the fastest a
  # send could ever fire), not how fast a real board actually settles (far
  # slower) - a sustained attack can still open a deficit against the real
  # player's own true pace large enough that catching up would take longer
  # than the match has left. This caps the total lifetime advance ever
  # skipped via recovery, independent of elapsed time or round count, so the
  # worst-case deficit stays small and recovery stays fast regardless of how
  # long a sustained attempt runs. Two rounds below stay within that budget
  # (nothing wrong with them individually) - the third, once the budget is
  # spent, is refused even though it would have passed every other check.
  # Local play is confirmed unaffected throughout - the true guarantee this
  # closes is that a sustained attack's damage stays small and recoverable,
  # never that the attack itself is impossible to attempt.
  @E1 @E4 @E6 @integration
  Scenario: A sustained attack cannot open a deficit larger than the match can recover from, and local play is unaffected throughout
    Given a real 5 second delay passes
    When the first page injects a crafted snapshot with sequence 16, board fill "yellow-diamond", and score 100
    Then the injected snapshot is accepted, not refused
    Given a real 5 second delay passes
    When the first page injects a crafted snapshot with sequence 32, board fill "silver-octagon", and score 200
    Then the injected snapshot is accepted, not refused
    Given a real 5 second delay passes
    When the first page injects a crafted snapshot with sequence 48, board fill "purple-triangle", and score 300
    Then the injected snapshot is refused, not accepted
    And no error or failure state is shown on either page
    Then the first page can still make a fresh move that increases its own local score

  # MP-SEQ-HARDEN (final round): the budget above gated on the total as it
  # stood BEFORE a round begins, not on what that round's own gap would
  # itself contribute if later skip-ahead-promoted - so a single round,
  # starting from a completely fresh (zero) budget, could still claim a gap
  # up to just under the plain gap check's own, much wider ceiling in one
  # shot, since nothing had been spent yet to compare against. Gating on the
  # projected total instead closes this - even a lone, first-ever round is
  # held to the same lifetime bound.
  @E1 @E6 @integration
  Scenario: A single fresh round cannot claim more than the entire lifetime skip-advance budget in one shot
    Given a real 5 second delay passes
    When the first page injects a crafted snapshot with sequence 45, board fill "yellow-diamond", and score 900
    Then the injected snapshot is refused, not accepted
