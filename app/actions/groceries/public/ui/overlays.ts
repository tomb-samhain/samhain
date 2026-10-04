// Positions a [popover] element next to its trigger, like Radix's Popper: below the
// trigger, aligned to its start or end edge, flipped above when there is no room.
export function placePopover(popover: HTMLElement, anchor: HTMLElement, align: 'start' | 'end' = 'start', offset = 4) {
  let rect = anchor.getBoundingClientRect()
  let width = popover.offsetWidth
  let height = popover.offsetHeight
  let margin = 8

  let left = align === 'end' ? rect.right - width : rect.left
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))

  let top = rect.bottom + offset
  if (top + height > window.innerHeight - margin && rect.top - offset - height > margin) {
    top = rect.top - offset - height
  }

  popover.style.left = `${left}px`
  popover.style.top = `${top}px`
}
