# CLAUDE.md

Guidance for the code in `src/features/quality-stats/`.

## DTLS counters

- `QualityStatsCollector.js` counts DTLS problems in two fields, with two handlers. Only one handler has a Firefox guard:
  - `processDtlsStateEntry()` increments `dtlsFailure` on the DTLS `failed` state. On Firefox it skips the increment when `lastIceDisconnect` is set, because Firefox signals DTLS `failed` right before ICE `failed` when it loses the transport.
  - `processDtlsErrorEntry()` increments `dtlsErrors` for each `ondtlserror` entry. It has no browser check and no ICE check.
- When you change one of the two handlers, check whether the other handler needs the same change.
- Firefox 154 and later send `ondtlserror` when ICE is lost. Earlier Firefox versions did not send it. So on Firefox, `dtlsErrors` can count ICE loss as a DTLS error. Do not read a Firefox `dtlsErrors` value as a DTLS fault without a check of `lastIceDisconnect` and `lastIceFailure`.
- If you add a guard to `processDtlsErrorEntry()`, do not copy only the `lastIceDisconnect` check from `processDtlsStateEntry()`. Also drop the error when `lastIceFailure !== 0`, and when the peer connection never got to the connected state (see `connectionStates` and `iceConnectionStates`).
- The `ondtlserror` dump entry holds the full `RTCError` object from the client (`@jitsi/rtcstats`). `StandardFeatureExtractor._handleDtlsError()` passes it to `processDtlsErrorEntry()` as `errormsg`, but the collector does not use it. Only the count is stored.
- Firefox sets the `RTCError` fields `sentAlert` and `receivedAlert` only for a fatal TLS alert. On the ICE-loss path both fields are empty, and a real DTLS fault has a value in one of them. To tell the two causes apart in stored data, keep `errorDetail`, `sentAlert` and `receivedAlert` in the record, not only a count.
