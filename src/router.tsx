import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { navigate } from './navigation'

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }

/** An anchor that routes through the hash router on plain left-clicks. */
export function Link({ to, onClick, ...rest }: LinkProps) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    navigate(to)
  }
  return <a href={`#${to}`} onClick={handleClick} {...rest} />
}
