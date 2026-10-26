# Line Face

The expression and motion language of a desk-lamp robot: a small arm with an OLED-screen head that helps you focus, nudges you to stand up, answers questions, and turns into a desk lamp.

**Live page:** https://jerrywu777.github.io/line-face/

## The rule

| Role | Form | States |
|---|---|---|
| Looks at you | **C · Punctuation**: dots, bars and arcs | Idle, Listen, Nudge |
| Is working | **D · Horizon**: one line that ripples, speaks and glows | Think, Answer, Sleep, Lamp |

When the robot changes role, the face changes form: the two eyes sink and melt into the horizon line, or the line lifts and gathers back into eyes. The change itself tells you what it is doing.

Every state pairs a face with an arm move. Two are signature moves:

- **Nudge**: before asking you to stand up, it stretches first, reaching straight up, then turns to you.
- **Lamp**: it bows slowly, turns its face to the desk, and the screen and the light ring around it become a lamp.

## Files

| File | What it does |
|---|---|
| `face.js` | Draws every expression and arm pose. All shapes use unit coordinates (-1..1), so the rules can be ported to an ESP32 driving an OLED. |
| `index.html` | The live page: preview, the seven states, the C ⇄ D switch and the motions. |

Run it locally by serving the folder, for example `python -m http.server`, and opening `http://localhost:8000`.

## Status

This is the initial design. It will be refined through hardware prototyping (ESP32, camera module, OLED screen with a light ring, small robot arm); the final look and motion appear in the portfolio renders.

## How this was made

**My role**
- Defined the design language: the C ⇄ D rule (punctuation when it looks at you, horizon when it works) and which state uses which form.
- Chose the expressions and the two signature moves (stretch to nudge, bow to become a lamp) through several rounds of comparison.
- Directed the visual style and reviewed every iteration of the face, the motion and this page.

**With Claude**
- Implemented my rules in code: the drawing functions in `face.js` and this web page.
- Generated the comparison drafts I chose from.

## License

MIT © 2026 JerryWu777
