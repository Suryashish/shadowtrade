# User Experience Guidelines

Instructions for any AI or developer building the UI. UX is a top priority: the product must be the easiest and most pleasant to use in its category, and look standard, clean and professional.

## Core principles
- **Obvious over clever.** A first-time user should know what to do without instructions. Use familiar patterns users already know from established apps.
- **Fewest steps possible.** Every click, field and popup must earn its place. Use sensible defaults so most users never change a setting.
- **One primary action per screen.** Make it visually clear; secondary actions stay quiet.
- **Hide complexity, don't remove control.** Show the simple path first; put advanced options behind a toggle or "More" section.
- **Plain language.** No jargon, no raw error codes. Say what happened and what to do next.

## Visual design
- Clean, minimal and consistent. Generous whitespace, clear alignment, nothing cluttered.
- Use a consistent system for spacing, type sizes, colors, radii and shadows. Don't invent one-off values.
- Clear hierarchy: the most important information is the largest and most prominent.
- Restrained color: one accent color for primary actions, plus standard colors for success, warning and error.
- Readable typography: one clean font family, comfortable size and line height, good contrast.
- Support light and dark mode properly.

## Feedback and states
- Every action gets immediate feedback: pressed states, loading indicators, success confirmations.
- Design every state, not just the happy path: empty, loading, error, success, disconnected.
- For slow or multi-step processes, show progress and what's happening now ("Step 2 of 4: confirming…").
- Confirm before anything irreversible or that moves money, and show exactly what will happen first.
- Errors explain the cause and offer a fix or retry. Never leave the user stuck.

## Trust and clarity
- Always show key information clearly: balances, amounts, fees and status. Never surprise the user.
- Format numbers for humans: thousands separators, sensible decimals, shortened addresses with copy buttons.
- Be honest about risks and limits; surface warnings at the moment they matter, not buried in docs.

## Accessibility and responsiveness
- Works well on mobile, tablet and desktop. Touch targets are large enough to tap easily.
- Full keyboard navigation, visible focus states, proper labels and WCAG AA contrast.
- Don't rely on color alone to convey meaning.

## Performance feel
- The UI must feel instant. Use skeletons and optimistic updates where safe; avoid layout shifts and long blank screens.
- Animations are subtle, quick and purposeful, never decorative or slow.

## Before finishing a screen
1. A new user can complete the main task without help.
2. All states (empty, loading, error, success) look intentional.
3. It looks polished and consistent on both mobile and desktop.
4. Nothing on the screen is unnecessary.
