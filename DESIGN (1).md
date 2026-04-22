---
name: AfterClass Premium
colors:
  surface: '#141218'
  surface-dim: '#141218'
  surface-bright: '#3b383e'
  surface-container-lowest: '#0f0d13'
  surface-container-low: '#1d1b20'
  surface-container: '#211f24'
  surface-container-high: '#2b292f'
  surface-container-highest: '#36343a'
  on-surface: '#e6e0e9'
  on-surface-variant: '#cbc4d2'
  inverse-surface: '#e6e0e9'
  inverse-on-surface: '#322f35'
  outline: '#948e9c'
  outline-variant: '#494551'
  surface-tint: '#cfbcff'
  primary: '#cfbcff'
  on-primary: '#381e72'
  primary-container: '#6750a4'
  on-primary-container: '#e0d2ff'
  inverse-primary: '#6750a4'
  secondary: '#cdc0e9'
  on-secondary: '#342b4b'
  secondary-container: '#4d4465'
  on-secondary-container: '#bfb2da'
  tertiary: '#e7c365'
  on-tertiary: '#3e2e00'
  tertiary-container: '#c9a74d'
  on-tertiary-container: '#503d00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#cfbcff'
  on-primary-fixed: '#22005d'
  on-primary-fixed-variant: '#4f378a'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#cdc0e9'
  on-secondary-fixed: '#1f1635'
  on-secondary-fixed-variant: '#4b4263'
  tertiary-fixed: '#ffdf93'
  tertiary-fixed-dim: '#e7c365'
  on-tertiary-fixed: '#241a00'
  on-tertiary-fixed-variant: '#594400'
  background: '#141218'
  on-background: '#e6e0e9'
  surface-variant: '#36343a'
typography:
  display-xl:
    fontSize: 60px
    fontWeight: '600'
    lineHeight: 72px
    letterSpacing: -0.02em
  display-lg:
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 60px
    letterSpacing: -0.02em
  h1:
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.02em
  h2:
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.02em
  h3:
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  body-lg:
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: '0'
  body-md:
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: '0'
  body-sm:
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  label-md:
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: '0'
  label-sm:
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: '0'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  3xl: 64px
---

## Brand & Style
The design system for AfterClass centers on a "Modern Corporate" aesthetic that merges clinical precision with high-end digital craftsmanship. It is designed for an academic or professional SaaS environment where clarity and focus are paramount. 

The visual narrative is defined by high-contrast typography and a strict adherence to a minimalist grid. To soften the corporate rigidity, glassmorphism is utilized for persistent interface elements (like navigation bars and pinned sidebars), creating a sense of depth and atmospheric layering. The brand evokes a sense of organized intelligence—reliable, fast, and sophisticated.

## Colors
This design system utilizes a dual-theme color architecture. The Dark Theme is the primary expression of the brand, emphasizing depth and focus, while the Light Theme provides a clean, document-centric alternative.

The **Brand Accent (Solid Purple)** is the sole carrier of semantic importance and action, ensuring that interactive elements are instantly recognizable against the neutral grayscale palette. Secondary text and borders are carefully calibrated to maintain legibility while receding into the background to prioritize content.

## Typography
The system relies exclusively on **Inter**, a geometric sans-serif optimized for screen readability. 

- **Headings:** Set with Semi-bold (600) weights and tight tracking (-0.02em) to create a compact, authoritative visual "block."
- **Body Text:** Utilizes standard tracking with generous line heights to ensure long-form academic content is easily digestible.
- **Labels:** Used for buttons, chips, and table headers, these use a smaller font size but maintain a Semi-bold weight for hierarchy without overwhelming the layout.

## Layout & Spacing
The layout follows a **Fixed Grid** philosophy. Content is contained within a 1280px max-width wrapper, centered on the viewport. This ensures a consistent reading experience across large monitors.

Internal spacing follows a strict 8px linear scale. A 12-column grid is used for dashboard layouts, with 32px gutters to provide significant breathing room between data-heavy modules. Vertical rhythm is maintained by using the "xl" (32px) and "xxl" (48px) units to separate major content sections.

## Elevation & Depth
Depth is communicated through three distinct methods:

1.  **Glassmorphism (Primary Elevation):** Pinned elements like top navigation and sidebars use a background blur (20px) and a subtle 1px border. This allows content to scroll beneath them while maintaining context.
2.  **Tonal Layering:** In the dark theme, the background is #101828, while cards and modals use a slightly elevated #1D2939 background to create a stacked effect.
3.  **Shadows:** Shadows are used sparingly. For modals and dropdowns, use a large, soft ambient shadow with 15% opacity, tinted with the surface color to avoid a "dirty" gray appearance.

## Shapes
The shape language is disciplined and geometric. 

- **Base Components:** All cards, inputs, and standard buttons must use a strict **8px radius**. 
- **Interactive Pill:** "Pill" shapes (100px) are reserved specifically for status indicators (Chips) and secondary "Ghost" buttons to distinguish them from primary actions.
- **Containers:** Large layout containers or modals may use a slightly softer 12px radius to feel more approachable.

## Components
- **Buttons:** Primary buttons are Solid Purple (#7F56D9) with white text and 8px corners. On hover, they shift to #6941C6. Secondary buttons use a subtle purple tint (10% opacity) or a simple border.
- **Inputs:** Standard fields use an 8px radius with a #344054 border (Dark) or #EAECF0 (Light). On focus, the border transitions to the Brand Accent with a 2px "glow" (outer shadow).
- **Glass Navigation:** The top bar should have a `backdrop-filter: blur(20px)` and a `background: rgba(16, 24, 40, 0.8)`. It features a 1px bottom border for definition.
- **Chips:** Small, pill-shaped indicators. Use the 10% transparent Brand Accent for "Active" states and a neutral gray for "Default" states.
- **Cards:** Use a 1px border (#344054 or #EAECF0) with no shadow for standard items. Only apply soft shadows on hover or for "floating" elements like tooltips.
- **Data Tables:** High-contrast rows with `label-sm` headers. Use subtle dividers rather than alternating row colors to maintain the minimalist aesthetic.