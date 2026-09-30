---
name: SignBridge
description: Visible conversation with a quiet video stage and one next action.
colors:
  ink: '#17273b'
  muted: '#516176'
  accent: '#2855cf'
  accent-hover: '#1e43a9'
  line: '#ccd5e0'
  page: '#f4f6f4'
  surface: '#ffffff'
  drawer: '#f7f9fc'
  stage: '#172432'
  control-hover: '#e4eafa'
  segmented: '#e5eaf2'
  disabled-text: '#64748a'
  disabled-surface: '#e6ebf2'
  danger-text: '#912e26'
  danger-surface: '#fff0ee'
  danger-line: '#ebbbb7'
typography:
  display:
    fontFamily: '"Segoe UI", Arial, sans-serif'
    fontSize: 3.25rem
    fontWeight: 650
    lineHeight: 1.08
    letterSpacing: -.035em
  headline:
    fontFamily: '"Segoe UI", Arial, sans-serif'
    fontSize: 1.375rem
    fontWeight: 700
    lineHeight: 1.25
  draft:
    fontFamily: '"Segoe UI", Arial, sans-serif'
    fontSize: 2.25rem
    fontWeight: 650
    lineHeight: 1.12
  body:
    fontFamily: '"Segoe UI", Arial, sans-serif'
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: '"Segoe UI", Arial, sans-serif'
    fontSize: .8125rem
  button:
    fontFamily: '"Segoe UI", Arial, sans-serif'
    fontSize: .9375rem
    fontWeight: 600
    lineHeight: 1.3
rounded:
  field: 8px
  button: 10px
  segment: 12px
  stage: 14px
  sheet: 16px
spacing:
  xs: 4px
  sm: 8px
  control: 12px
  md: 16px
  lg: 24px
  page: 32px
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.surface}'
    rounded: '{rounded.button}'
    typography: '{typography.button}'
    padding: 9px 14px
  button-primary-hover:
    backgroundColor: '{colors.accent-hover}'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.button}'
    padding: 9px 14px
  button-danger:
    backgroundColor: '{colors.danger-surface}'
    textColor: '{colors.danger-text}'
    rounded: '{rounded.button}'
    padding: 9px 14px
  field:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.field}'
    padding: 12px
  reply-selector:
    backgroundColor: '{colors.segmented}'
    rounded: '{rounded.segment}'
    padding: 4px
  video-stage:
    backgroundColor: '{colors.stage}'
    rounded: '{rounded.stage}'
  drawer:
    backgroundColor: '{colors.drawer}'
    padding: 24px
---

# Design System: SignBridge

## Overview

**Creative North Star: "Conversation console"**

The conversation console keeps the other person visible and the next response easy to find. Ink text, cobalt actions, thin borders and a dark video stage support a quiet Russian interface with prominent English phrases.

This records the implemented lobby and active call, including their drawers and embedded movement examples. Local diagnostics, the standalone examples page and the ended-call history retain the earlier green system; they are not evidence for extending the new palette. The shared page background still comes from style.css.

**Key Characteristics:**

- Video and phrases carry the visual emphasis.
- One saved draft stays distinct from a tentative prediction.
- Supporting details open on demand.
- No shipped decorative raster assets or downloaded fonts.

## Colors

Cobalt identifies conversation actions; quiet neutral surfaces keep video and language dominant. Frontmatter contains the normative values.

### Primary

- **Cobalt action** (`accent`): primary actions, progress and focus; `accent-hover` darkens the enabled action.

### Secondary

- **Warm danger** (`danger-text`, `danger-surface`, `danger-line`): the labelled end-call action and its confirmation.

### Neutral

- **Ink / muted**: main text and secondary instructions.
- **Page / surface / drawer**: inherited page ground, white controls and pale modal panels.
- **Stage**: letterboxing around live video, separate from page surfaces.
- **Line / segmented / control-hover**: separators, reply-selector tray and enabled hover.
- **Disabled text / disabled surface**: readable unavailable controls, with explicit disabled semantics.

The declared `--ground` is unused and is intentionally absent from the tokens. Existing error blocks and diagnostic chips retain inherited green/peach styles; they are outside the new palette's reusable primitives.

## Typography

**Display and body stack:** Segoe UI, Arial, sans-serif. No font files ship. The inherited local stack begins with Inter, without bundling it.

The frontmatter records actual implementation values, including the current system-font display. It is not a newly commissioned display identity.

- **Display:** lobby introduction; mobile override is 2rem after the final cascade.
- **Headline:** response workspace and drawer headings.
- **Draft:** saved English phrase; mobile reduces to 1.625rem, preserving wrap.
- **Body / label:** readable instructions and quieter metadata.
- **Captions:** 1.375rem, line height 1.35; 1.125rem on phones. Interim speech is italic.

**The Phrase Priority Rule.** Keep the saved draft larger than instructions and model details.

## Layout

The lobby and active call share a centered maximum width of 1600px. The lobby uses 24px 32px outer padding and two columns (1.15fr / .85fr). The active call uses 16px 24px padding, a flexible stage and a 350px response column separated by a border and 24px gap.

At 1050px the response column becomes 310px with a 16px gap. At 760px the page padding becomes 12px, call content stacks, and the lobby puts entry controls before its illustrative conversation. The final phone video height is clamp(180px,23svh,240px); desktop uses clamp(280px,calc(100svh - 315px),760px).

Remote video uses contain, preserving the complete frame. The mirrored self-preview and its landmarks share bounds and transform. The normal self-preview is at most 210px/25% on desktop and 120px/33% on phones; its expand control changes presentation.

Captions occupy their own band below video: up to three visible lines on desktop and two on phones, with keyboard-accessible scrolling. Controls and header navigation wrap; button text may wrap anywhere to preserve content at enlarged text sizes. Drawers occupy the right edge on desktop (480px, or 760px for help) and become a bottom sheet at 760px (92dvh, beginning at 8svh). Content remains scrollable.

## Elevation & Depth

Most surfaces are flat. Thin dividers, the dark video area and pale selector tray provide separation. The selected reply option alone uses the small shadow `0 2px 5px #17273b12`. Drawers use a translucent backdrop (`#101d3459`), not a floating-card shadow.

**The Quiet Surface Rule.** Use borders and tonal areas to separate work; reserve the small shadow for the selected reply option.

## Shapes

Inputs and self-preview use modest rounded corners; buttons are slightly softer, and the stage forms the largest closed area. Reply selectors have a rounded shared tray. Phone drawers round only their top corners. The response workspace itself is an open region separated by a line, not a card.

## Components

### Buttons

Labelled and compact. Primary actions use cobalt, secondary actions white, and end-call uses warm danger tones. The base minimum height is 44px; phone navigation and selector controls use 40px, with smaller preview controls. Disabled controls retain readable color. Background transitions take 160ms ease-out and are removed for reduced motion. Keyboard focus uses a 3px cobalt outline with 3px offset.

### Inputs / Fields

White fields use a thin line border, the field radius and 12px padding. Labels remain outside the field. Textareas can resize vertically. Focus follows the shared outline. Example selectors use the same shape with 10px padding.

### Navigation and reply selector

Header buttons open invitation, history and help panels. On phones the navigation takes its own full-width row. Gesture/voice selection uses aria-pressed with a white selected option, blue label and the small selected-state shadow. It changes the visible response tools.

### Video stage and feedback

A dark, clipped container holds the remote feed with a compact own-camera inset. Participant names sit in small translucent labels. The saved draft appears before guidance; model assumptions remain smaller and are hidden when a draft exists. Send and retry remain paired, with detailed scores behind a disclosure. Camera toggling preserves the draft.

### Drawers and history

Native modal dialogs provide invitation, text history, help and diagnostics, with a sticky heading and explicit close button. Conversation entries use dividers rather than bubbles. Embedded examples display recorded landmark data on canvas; these are evidence aids, not decorative imagery or live recognition results.

## Do's and Don'ts

### Do:

- Do keep captions outside the video and preserve their scrollable full text.
- Do show state with words as well as color.
- Do keep draft confirmation and retry together.
- Do preserve visible keyboard focus and reduced-motion behavior.

### Don't:

- Don't present fixture video artwork as a shipped brand asset.
- Don't merge a tentative model prediction with the saved draft.
- Don't import the legacy green cards into new conversation surfaces.
- Don't describe the limited movement vocabulary as universal sign-language translation.

Not canonized or repaired: the inherited green ended-call/local/example surfaces, standalone examples eyebrow, and system-font lobby display remain implementation boundaries or craft debt. They are recorded honestly, not promoted into new design rules. Screenshot faces and colored video backgrounds are synthetic test fixtures only.
