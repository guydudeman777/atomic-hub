/** The casino's one neon sign: a starburst and the name, buzzing on as you walk in. */
export function NeonSign({ as: Tag = 'h1', className = '' }: { as?: 'h1' | 'div'; className?: string }) {
  return (
    <Tag className={`bj-sign ${className}`.trim()}>
      <svg className="bj-sign__star" viewBox="-10 -10 20 20" aria-hidden="true">
        <path d="M0-10L1.6-1.6 10 0 1.6 1.6 0 10-1.6 1.6-10 0-1.6-1.6Z" />
      </svg>
      Blackjack
    </Tag>
  )
}
