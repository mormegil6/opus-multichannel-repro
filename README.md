# Opus above 2 channels fails to decode in Chrome under the DirectOpusAudioDecoding field trial

**Live check: https://mormegil6.github.io/opus-multichannel-repro/**

**Filed:** Chromium issue: _(pending, link goes here once filed)_

Minimal, self-contained reproduction. With Chrome's `DirectOpusAudioDecoding`
feature enabled, Opus audio with more than two channels fails to decode. Stereo
Opus is unaffected, which is what makes the failure so confusing in the field:
ordinary audio, ordinary video and every stereo test page keep working.

Both decode paths fail:

- `decodeAudioData` rejects with `EncodingError: Unable to decode audio data`
- MSE playback fails at decoder initialisation with
  `PipelineStatus::DECODER_ERROR_NOT_SUPPORTED: audio decoder initialization failed with DecoderStatus::Codes::kUnsupportedConfig`

The page embeds a 2-channel and a 16-channel Opus/WebM buffer as base64 and
decodes each through both paths. Nothing is fetched, so it also runs from a
local copy of `index.html` with no server.

## Reproducing

```
# force the feature ON: the 16-channel row fails
chrome --enable-features=DirectOpusAudioDecoding --user-data-dir=/tmp/p1

# force it OFF: everything passes
chrome --disable-features=DirectOpusAudioDecoding --user-data-dir=/tmp/p2
```

If the page reports the failure without you passing any flag, the feature is
already enabled for your profile through the variations seed.

## Status

Measured on macOS 15, Apple silicon, 2026-08-16.

| Browser | Version | Feature by default | Stereo | 16-channel |
|---|---|---|---|---|
| Chrome | 151.0.7922.138 | on (`EnabledLaunch`) | passes | **fails** |
| Chrome | 151.0.7922.138 | forced off | passes | passes |
| Brave | 151.1.93.136 | not enrolled | passes | passes |
| Brave | 151.1.93.136 | forced on | passes | **fails** |
| Edge | 151.0.4129.86 | not enrolled | passes | passes |
| Edge | 151.0.4129.86 | forced on | passes | **fails** |
| Firefox | 153.0.4 | not applicable | passes | passes |

Brave and Edge run their own variations service rather than Google's, so they
are not enrolled in this trial. Force it on and they fail identically, which
places the defect in Chromium rather than in Chrome's packaging of it.

## Why it is hard to diagnose

Every isolation step a developer would normally reach for returns the same
result, because they all inherit the same variations seed:

- An incognito window does not start a new browser process.
- Neither does a guest profile.
- Quitting and restarting Chrome does not clear it; the seed is persistent.
- The feature has no `chrome://flags` entry, so searching there finds nothing.
- Two Chrome installs on the same version disagree depending on their seed, so
  comparing version numbers misleads.

A fresh profile, which is what an automated browser launch gets, has no seed at
all and therefore passes, so the same binary can look healthy under test and
broken in daily use.

## Workaround

Launch Chrome with `--disable-features=DirectOpusAudioDecoding`, or use a
browser that is not enrolled. There is nothing a page can do about it: feature
flags are set in the browser process at startup and are not reachable from
script.

## Sample content

48 kHz Opus in WebM, channel mapping family 255, at 2 and 16 channels. The same
failure occurs at 25 channels. Mapping family 255 is used because the content is
full-spectrum multichannel (third and fourth order Ambisonics) rather than a
downmixable 5.1 or 7.1 layout.

## Context

Found while running a Higher-Order Ambisonics livestream, where the 16-channel
audio simply stopped playing and presented as a stuck loading spinner rather
than an error: https://github.com/mormegil6/ambisonic-box
