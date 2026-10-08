// logo-mark.png is the same artwork as logo-circle.png, trimmed to its
// own bounding box and resized to 512px — 207KB instead of 1.7MB, which
// matters because this mark renders on every page of the site.
import logoMark from '../assets/logo-mark.png'

export function Brand({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`grid overflow-hidden rounded-full bg-white shadow-md ring-1 ring-black/5 ${compact ? 'h-12 w-12' : 'h-24 w-24 sm:h-28 sm:w-28'}`}>
        {/* object-contain, and no scale: the artwork is a circle that
            already fills its square canvas, so zooming it inside a round
            frame cropped the green banner off the top and BAKERY off the
            bottom. Nothing was off-centre — 25% of it was simply outside
            the frame. */}
        <img src={logoMark} alt="Pecto's Bakery logo" className="h-full w-full rounded-full object-contain" />
      </span>
      <span className={`${compact ? 'text-xl' : 'text-2xl'} font-display font-bold tracking-tight text-crust-700`}>PECTRACK</span>
    </div>
  )
}
