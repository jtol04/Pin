import { useState } from 'react'

interface Props {
  conflicts: string[]
}

export default function ConflictBanner({ conflicts }: Props) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || conflicts.length === 0) return null

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl px-5 py-4 flex gap-4 items-start shadow-sm">
      <span className="text-amber-500 text-xl mt-0.5">&#9888;</span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-amber-800 mb-1">Scheduling conflicts</p>
        <ul className="list-disc list-inside space-y-0.5">
          {conflicts.map((c, i) => (
            <li key={i} className="text-xs text-amber-700">
              {c}
            </li>
          ))}
        </ul>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-400 hover:text-amber-600 text-xl leading-none mt-0.5 transition-colors"
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  )
}
