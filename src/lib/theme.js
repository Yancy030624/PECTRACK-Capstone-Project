// A colour token's current value (index.css @theme), for drawing code
// such as Chart.js that cannot use Tailwind classes.
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
