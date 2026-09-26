import Chart from 'chart.js/auto'

// Charts in a printout — PHASE10 B3.
//
// Chart.js sizes a chart to its container, but the switch to the print
// layout happens without a resize event it reacts to, so a chart would
// print at its on-screen width: cropped, or squashed onto the page. Two
// details matter, both found by printing a real report:
//
//   - When to resize. Browsers do not agree on whether `beforeprint` fires
//     before or after the print layout applies; the print media query
//     changing is the moment the layout actually changes. Both are
//     listened to, so whichever comes second measures the right width.
//   - How to redraw. A normal update animates, and the print snapshot does
//     not wait for an animation — a report printed with its sales chart
//     half-drawn, or blank. Any animation still running (a chart that
//     loaded a moment ago) is stopped, then update('none') redraws in one
//     frame.
function redrawAll() {
  for (const chart of Object.values(Chart.instances)) {
    chart.stop()
    chart.resize()
    chart.update('none')
  }
}

window.addEventListener('beforeprint', redrawAll)
window.addEventListener('afterprint', redrawAll)
window.matchMedia?.('print').addEventListener?.('change', redrawAll)
