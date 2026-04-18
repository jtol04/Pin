import { useState } from 'react'

interface Props {
  tripId: string
}

export default function TripShare({ tripId }: Props) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/trip/${tripId}`

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
      <span className="text-sm text-gray-500">Share trip</span>
      <span className="flex-1 text-sm text-gray-700 font-mono truncate">{url}</span>
      <button
        onClick={handleCopy}
        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors whitespace-nowrap"
      >
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  )
}
