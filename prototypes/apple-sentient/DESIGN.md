# Public Site Design Direction

## Approved Direction

Source: `.impeccable/mocks/home-mobile-approved.png`

The selected direction is a mobile-first editorial product launch: a compact navigation bar, a concise dark hero, a large authentic reader view, and a warm paper transition into an interactive theme selector. The reader is the visual focal point. Secondary pages use the same typography, ink, paper, and rule system while changing their composition to fit their purpose.

## User Refinements

- Align the `Start practicing` action to the right side of the hero copy.
- Replace the blue CTA treatment with black.
- In Dark mode, give the black CTA a visible white border.
- Selecting Automatic, Light, Sepia, or Dark changes the public page treatment and its reader preview.

## Visual System

- Display voice: Lora for large editorial statements.
- Interface voice: Noto Sans Hebrew for compact controls and metadata, including its Latin coverage.
- Torah media: the existing reader and its authentic Hebrew type only.
- Accent: restrained gold for focus and selected state. Blue remains only where it already exists inside protected reader media.
- Shape: modest 12-18px radii for interactive surfaces; paper sections may use one broad top curve.
- Lines: quiet 1px rules establish hierarchy before containers or shadows.
- Texture: the existing ambient raster is limited to the homepage hero. Secondary pages use clean paper surfaces.

## Theme Surfaces

- Automatic follows the operating-system color preference.
- Light uses near-white paper, black ink, and subtle neutral rules.
- Sepia uses warm parchment, dark brown ink, and softened rules.
- Dark uses near-black ink space, white type, and a white outline on the primary black CTA.

## Motion Grammar

- Initial hero copy and reader media arrive once with opacity and transform only.
- Theme changes crossfade color, border, and media over about 240ms with an ease-out curve.
- Controls respond within 160ms; pressed states use a subtle 0.98 scale.
- No scroll listeners, continuous parallax, or decorative hover motion.
- Reduced motion removes spatial transitions and keeps immediate state changes.

## Responsive Contract

- The 390px composition is the primary target, with no horizontal overflow and at least 44px touch targets.
- The reader preview remains frontal and readable on mobile.
- Desktop expands the same hierarchy into a left copy and right product composition without changing the story order.
- Readings becomes a searchable index rather than a long stack of repeated marketing cards.
