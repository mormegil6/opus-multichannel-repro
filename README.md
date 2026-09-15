# Opus above 2 channels fails to decode in Chrome under the DirectOpusAudioDecoding field trial

**Live check: https://mormegil6.github.io/opus-multichannel-repro/**

**Filed:** https://issues.chromium.org/issues/547065816

**Fixed and verified for the originally filed case**, 2026-08-24: [verified](https://issues.chromium.org/issues/547065816#comment10) on Chrome Canary 154.0.8021.0 (macOS 26.6.1), both channel counts passing with the feature forced on and forced off, and independently reconfirmed here on 2026-09-14 against Chrome 153.0.8010.36 on Linux, the exact stable build a later report names. This repro page reports "not reproduced" on those builds. A separate, unresolved report on 1-channel Opus is open as of 2026-09-14: see Status below before assuming this page's green result closes every case.

Minimal, self-contained reproduction. With Chrome's `DirectOpusAudioDecoding` feature enabled, Opus audio with more than two channels fails to decode. Stereo Opus is unaffected, which is what makes the failure so confusing in the field: ordinary audio, ordinary video and every stereo test page keep working.

Both decode paths fail:

- `decodeAudioData` rejects with `EncodingError: Unable to decode audio data`
- MSE playback fails at decoder initialisation with `PipelineStatus::DECODER_ERROR_NOT_SUPPORTED: audio decoder initialization failed with DecoderStatus::Codes::kUnsupportedConfig`

The page embeds a 2-channel and a 16-channel Opus/WebM buffer as base64 and decodes each through both paths. Nothing is fetched, so it also runs from a local copy of `index.html` with no server.

## Reproducing

```
# force the feature ON: the 16-channel row fails
chrome --enable-features=DirectOpusAudioDecoding --user-data-dir=/tmp/p1

# force it OFF: everything passes
chrome --disable-features=DirectOpusAudioDecoding --user-data-dir=/tmp/p2
```

If the page reports the failure without you passing any flag, the feature is already enabled for your profile through the variations seed.

`check.mjs` automates the three-run sweep above (default, forced on, forced off) against the installed Chrome and prints every row, which is how the "After the fix" table below was produced:

```
node check.mjs      # needs playwright-core in node_modules
```

## Status

### Before the fix, measured on macOS 15, Apple silicon, 2026-08-16

| Browser | Version | Feature by default | Stereo | 16-channel |
|---|---|---|---|---|
| Chrome | 151.0.7922.138 | on (`EnabledLaunch`) | passes | **fails** |
| Chrome | 151.0.7922.138 | forced off | passes | passes |
| Brave | 151.1.93.136 | not enrolled | passes | passes |
| Brave | 151.1.93.136 | forced on | passes | **fails** |
| Edge | 151.0.4129.86 | not enrolled | passes | passes |
| Edge | 151.0.4129.86 | forced on | passes | **fails** |
| Firefox | 153.0.4 | not applicable | passes | passes |

Brave and Edge run their own variations service rather than Google's, so they are not enrolled in this trial. Force it on and they fail identically, which places the defect in Chromium rather than in Chrome's packaging of it.

### After the fix, measured 2026-09-14, with a 1-channel clip added

A third-party report ([issue comment #15](https://issues.chromium.org/issues/547065816#comment15)) describes the same failure shape on Chrome 153 stable and 155 Canary, on Linux, for 1-channel Opus: `isConfigSupported()` reports supported, then decode throws. The 2026-09-03 verification that closed the M153 merge request tested only the 2-channel and 16-channel rows, so a 1-channel row was never actually checked on any build. This page now embeds one (48 kHz mono, `aevalsrc` sine tone through libopus, same encode style as the other two clips; see `make-mono-asset.sh`).

| Browser | Version | OS | Feature | Stereo | 16-channel | 1-channel |
|---|---|---|---|---|---|---|
| Chrome | 152.0.7977.76 | macOS 15.7.9 | default | passes | passes | passes |
| Chrome | 152.0.7977.76 | macOS 15.7.9 | forced on | passes | **fails** | passes |
| Chrome | 152.0.7977.76 | macOS 15.7.9 | forced off | passes | passes | passes |
| Chrome | 153.0.8010.36 | Ubuntu 26.04 | default | passes | passes | passes |
| Chrome | 153.0.8010.36 | Ubuntu 26.04 | forced on | passes | passes | passes |
| Chrome | 153.0.8010.36 | Ubuntu 26.04 | forced off | passes | passes | passes |

Two things worth separating. First, 153.0.8010.36 is the exact build named in comment #15, and here the original 16-channel failure no longer reproduces under the same `--enable-features` forcing that reproduced it pre-fix on 152. That forcing is a command-line override, so the on/off axis itself is not seed-dependent - the same technique this page has used throughout, including in the tracker's own bisection work - but some Chromium trials carry parameters beyond plain enable/disable, and a bare flag activates the feature with its coded defaults, not necessarily whatever combination a real seed-enrolled profile would carry. What supports treating the flag as representative here rather than assuming it: pre-fix, the same forcing reproduced the exact failure mode field reports described (the same error strings), so the forced path and the field-observed one were at least the same broken path once. Second, the 1-channel row passes everywhere it was tried, including forced on, on both platforms and both builds, which does not reproduce comment #15's report. That does not refute it: a bare sine tone may not hit whatever their real content does, and the comment describes the failure as sporadic at earlier versions before becoming consistent at 153 for them.

**Update, 2026-09-14**: [comment #16](https://issues.chromium.org/issues/547065816#comment16) on the tracker independently reaches the same result. Dale Curtis, the assignee's reviewer on the original fix, ran his own mono test cases and reports them working fine, and has asked the comment #15 reporter to file a separate bug with a reproduction rather than continue on this one, since 547065816 stays scoped to the originally filed >2-channel case and stays Fixed there. This page's own measurements above were made before that comment appeared and corroborate it independently, on a different platform (macOS in addition to Linux) with a public, runnable page rather than an unshared test case.

**Root cause found, 2026-09-15**: [comment #18](https://issues.chromium.org/issues/547065816#comment18) explains comment #15 precisely, and explains why this page could never have reproduced it. The trigger is a WebCodecs `AudioDecoder` configured with a non-48 kHz `sampleRate` (comment #15's real content, evidently). The pre-fix `FFmpegAudioDecoder` path silently ignored the caller's sample rate and always ran Opus at 48 kHz, correctly, since Opus is always 48 kHz internally per RFC 7845. The new `OpusAudioDecoder` instead passed the caller's `sampleRate` straight into `opus_multistream_decoder_create()`, which accepts only 8, 12, 16, 24 or 48 kHz, so a non-48 kHz config fails with `OPUS_BAD_ARG`. This page tests through WebM plus `decodeAudioData`/MSE, and Chromium's `WebMAudioClient::InitializeConfig` hardcodes `samples_per_second = 48000` regardless of file content, so that path structurally cannot exercise the bug: the mono row here was never wrong, it was testing a code path this bug does not reach. Fix: CL [8408705](https://chromium-review.googlesource.com/c/chromium/src/+/8408705), normalises `OpusAudioDecoder` to always decode at 48000 Hz internally, with WPT coverage added for non-48 kHz configs and empty extradata. Distinct bug, distinct root cause, from the >2-channel channel-mapping fault this page was built to reproduce; the two only look related because they share the same outer symptom, `isConfigSupported` true followed by a decode-time throw.

## Why it is hard to diagnose

Every isolation step a developer would normally reach for returns the same result, because they all inherit the same variations seed:

- An incognito window does not start a new browser process.
- Neither does a guest profile.
- Quitting and restarting Chrome does not clear it; the seed is persistent.
- The feature has no `chrome://flags` entry, so searching there finds nothing.
- Two Chrome installs on the same version disagree depending on their seed, so comparing version numbers misleads.

A fresh profile, which is what an automated browser launch gets, has no seed at all and therefore passes, so the same binary can look healthy under test and broken in daily use.

## Workaround

Launch Chrome with `--disable-features=DirectOpusAudioDecoding`, or use a browser that is not enrolled. There is nothing a page can do about it: feature flags are set in the browser process at startup and are not reachable from script.

## Sample content

48 kHz Opus in WebM, channel mapping family 255, at 2 and 16 channels. The same failure occurs at 25 channels. Mapping family 255 is used because the content is full-spectrum multichannel (third and fourth order Ambisonics) rather than a downmixable 5.1 or 7.1 layout. The 2-channel and 16-channel clips have no committed generation script; they predate this repository's own convention of keeping one.

The 1-channel clip added 2026-09-14 does: `make-mono-asset.sh` synthesises a 440 Hz sine tone with `aevalsrc` and encodes it with libopus at 48 kHz, matching the other two clips' sample rate and general encode style (mapping family 0, since a single channel has nothing to map). Regenerate with `./make-mono-asset.sh`, which needs only ffmpeg with the libopus encoder and prints the base64 to paste into `index.html`'s `CLIPS` array.

## Context

Found while running a Higher-Order Ambisonics livestream, where the 16-channel audio simply stopped playing and presented as a stuck loading spinner rather than an error: https://github.com/mormegil6/ambisonic-box
