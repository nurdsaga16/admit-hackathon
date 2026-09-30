---
name: SignBridge
description: Approved dark video conversation interface from SignBridge.dc.html.
colors:
  page: '#0d1719'
  outer: '#081012'
  surface: '#122024'
  feedback: '#132326'
  stage: '#101c1f'
  field: '#0a1315'
  message: '#1e3439'
  text: '#eaf3f1'
  secondary: '#c3d3d1'
  muted: '#b3c6c3'
  placeholder: '#8fa6a3'
  accent: '#5ee6c4'
  accent-hover: '#83f0d5'
  accent-ink: '#04241c'
  warning: '#f4c26b'
  error: '#ff8a8a'
  danger: '#e5484d'
  danger-hover: '#f05a5f'
  white: '#ffffff'
  line: 'rgba(220,240,235,.08)'
  control-line: 'rgba(220,240,235,.3)'
typography:
  display:
    fontFamily: 'Onest, system-ui, sans-serif'
    fontSize: 72px
    fontWeight: 700
    lineHeight: 1.03
    letterSpacing: '-.03em'
  headline:
    fontFamily: 'Onest, system-ui, sans-serif'
    fontSize: 40px
    fontWeight: 700
    letterSpacing: '-.02em'
  phrase:
    fontFamily: 'Onest, system-ui, sans-serif'
    fontSize: 25px
    fontWeight: 600
    lineHeight: 1.15
  body:
    fontFamily: 'Onest, system-ui, sans-serif'
    fontSize: 16px
    lineHeight: 1.5
  button:
    fontFamily: 'Onest, system-ui, sans-serif'
    fontSize: 16px
    fontWeight: 600
  room-link:
    fontFamily: 'JetBrains Mono, monospace'
    fontSize: 14px
rounded:
  small: 8px
  compact: 10px
  control: 12px
  message: 14px
  feedback: 16px
  stage: 18px
  dialog: 20px
spacing:
  xs: 4px
  sm: 8px
  tight: 10px
  gap: 12px
  gutter: 14px
  md: 16px
  lg: 24px
  section: 40px
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.accent-ink}'
    rounded: '{rounded.control}'
    typography: '{typography.button}'
    padding: 0 16px
  button-primary-hover:
    backgroundColor: '{colors.accent-hover}'
  button-danger:
    backgroundColor: '{colors.danger}'
    textColor: '{colors.white}'
    rounded: '{rounded.control}'
  field:
    backgroundColor: '{colors.field}'
    textColor: '{colors.text}'
    rounded: '{rounded.control}'
    padding: 12px 14px
  video-stage:
    backgroundColor: '{colors.stage}'
    rounded: '{rounded.stage}'
  feedback:
    backgroundColor: '{colors.feedback}'
    rounded: '{rounded.feedback}'
    padding: 12px 16px 14px
  chat:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.stage}'
---

# Design System: SignBridge

## Overview

The approved visual authority is [SignBridge.dc.html](design-reference/SignBridge.dc.html). This document records the implemented dark interface; it replaces the previous light, cobalt system. No new creative metaphor is introduced beyond the supplied design.

Deep green backgrounds, mint actions, rounded video and chat surfaces, and Onest typography tie the landing page and conversation together. The supplied logo is copied to `web/public/assets/signbridge-logo.png`; its crop follows the export. The landing page includes an illustrative conversation. Active calls use actual media streams and actual conversation state.

**Key Characteristics:**

- Mint actions and saved phrases stand out against dark surfaces.
- Status includes text and icons alongside color.
- Tentative predictions, saved drafts and sent messages remain distinct.
- Technical details remain available through help and diagnostics.

## Colors

### Primary

**Mint action** (`accent`, `accent-hover`, `accent-ink`) identifies primary actions, focus, connected state and confirmed drafts.

### Secondary

**Amber** (`warning`) marks waiting and uncertainty. **Soft red** (`error`) marks guidance requiring attention. **Red action** (`danger`, `danger-hover`) identifies ending the call.

### Neutral

**Page / outer** form the dark ground. **Surface / feedback / stage** distinguish chat, phrase panel and video. **Field / message** separate inputs and received bubbles. **Text / secondary / muted / placeholder** form the reading hierarchy. Thin translucent borders provide separation.

**State clarity rule.** Color supplements a visible state label; it never supplies the whole explanation.

## Typography

Onest is the display and body face, with system-ui and sans-serif fallbacks. JetBrains Mono is used for the room link. Material Symbols Rounded supplies interface icons. All three families load from Google Fonts in `web/index.html`; they are external dependencies, not bundled fonts.

Landing display steps from 72px to 58px below 1200px, then 44px below 760px. Landing section headings step from 40px to 30px on phones. Call phrase text is 25px, grows to 30px at viewport heights of at least 800px, and is 23px on phones. Captions use 26px, 30px on tall desktop views, and 21px on phones. Body and control sizes vary by component, with quiet supporting labels at 13–15px.

**Phrase priority rule.** Saved phrase text is larger than its state and guidance; detailed scores stay subordinate.

## Layout

Landing sections are centered at a maximum 1200px with 40px horizontal padding, reduced to 20px on phones. The hero uses an adaptive two-column grid and becomes one column as available width requires. Desktop hero padding is 80px 40px 104px; section padding is 96px 40px. Phone values are 44px 20px 64px and 56px 20px. The sticky header is 72px tall on desktop.

The call occupies the full window width. Desktop workspace gutters are 14px with 12px gaps, a flexible video/phrase/control column and a permanent chat column of 340px, increasing to 380px at widths of at least 1400px. The phrase panel is horizontal with wrapping actions under the video. Waiting retains this same call grid by explicit user choice.

Below 760px, the call stacks with 10px horizontal gutters; video height is 86vw and chat height is 520px. Media controls form three columns with the end-call action across the full row. On desktop heights of 680px or less, the page scrolls rather than clipping content.

Remote video uses contain. Own video and landmarks share mirrored bounds. Own preview width is 200px, 232px at heights of at least 800px, and 104px on phones; maximum width constraints also apply. Expansion changes presentation without changing recognition coordinates or media tracks. Captions overlay the lower video in a translucent dark panel; long text wraps and scrolls after three lines. Help is a native modal dialog, up to 880px wide; on phones it becomes a bottom sheet up to 88dvh.

## Elevation & Depth

Tonal surfaces and translucent borders carry most separation. Own preview uses `0 8px 24px rgba(0,0,0,.35)`. Captions and participant labels have translucent dark backgrounds. Dialog backdrop is `rgba(4,9,10,.75)`. The sticky landing header uses a 10px backdrop blur. There is no general floating-card shadow system.

## Shapes

Controls use soft 12px corners, compact controls 8–10px, message bubbles 14px, feedback 16px and video/chat surfaces 18px. Dialogs use 20px corners and phone sheets round their upper edge. Own-camera preview is clipped with a translucent border. The landing mock conversation has a 22px outer radius, preserving the supplied composition.

## Components

### Buttons and fields

Primary buttons are mint with dark text; secondary controls use translucent outlines; end-call is red. Default minimum button height is 44px, draft actions 48px and media controls 52px. Hero actions are 56px. Focus uses a 3px mint outline with 2px offset. Disabled controls expose disabled semantics; the chat submit button has an explicit muted surface. Inputs use dark fill and a translucent border. Selected response segments use light fill and dark text.

### Feedback

The same feedback panel presents measured tracking guidance, progress, uncertainty, a saved draft, command mode and exit confirmation. Ready is mint; uncertain is amber with a dashed border; errors use soft red. The phrase and its actions wrap together. Changes in layout do not change inference, command geometry, hold requirements or draft rules.

### Video, captions and chat

The remote stream is the primary visual area. Own-preview controls remain local to its inset. Captions sit over the remote video. Chat remains visible beside the stage on desktop; own bubbles align right with a mint tint, received bubbles left with a solid dark surface. Text input stays at the bottom of the chat panel.

### Entry, help and summary

Create/join entry uses a native dialog and response-choice buttons. Help and diagnostics use native dialog behavior with a close control. The ended-call summary uses the same dark identity and conversation bubbles. The removed standalone camera page remains available only as a development test harness, not a product destination.

## Do's and Don'ts

### Do:

- Do use the approved HTML export when resolving visual ambiguity.
- Do retain full-width desktop call composition and the waiting call grid.
- Do preserve live video/landmark alignment, command coordinates and visible focus.
- Do distinguish demonstration imagery on the landing page from actual call state.
- Do retain reduced-motion handling for call controls and scrolling.

### Don't:

- Don't restore the discarded pale background, cobalt actions or Segoe display system.
- Don't replace live streams with the export's illustrative participant avatars.
- Don't promote confidence scores into a guarantee of translation accuracy.
- Don't describe the 11 conditional movement-to-phrase assignments as newly trained sign-language translation.

Review evidence: `.impeccable/review/comparison-{landing,call}-{1440,1920,390}.png`. These comparisons address visual fidelity; physical camera, speech and different-network reliability require separate manual verification.
