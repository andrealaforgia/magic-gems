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
  # one modest, real-time-plausible jump in isolation) - the SECOND repeat of
  # the same-sized jump, no longer plausible for how little additional real
  # time has actually passed, is what must fail.
  @E1 @E6 @integration
  Scenario: Repeating a modest forged jump cannot walk the expected sequence forward without limit
    Given a real 5 second delay passes
    When the first page injects a crafted snapshot with sequence 46, board fill "yellow-diamond", and score 400
    Then the injected snapshot is accepted, not refused
    Given a real 5 second delay passes
    When the first page injects a crafted snapshot with sequence 92, board fill "silver-octagon", and score 800
    Then the injected snapshot is refused, not accepted
