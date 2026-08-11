export interface LevelRange {
	min: number
	max: number
}

export function parseRangeOverrides(raw: string): Map<string, LevelRange> {
	const ranges = new Map<string, LevelRange>()

	for (const entry of raw.split(',')) {
		const trimmed = entry.trim()
		if (!trimmed) continue

		const separatorIndex = trimmed.indexOf('=')
		if (separatorIndex < 1) continue

		const instanceTag = trimmed.slice(0, separatorIndex).trim()
		const rangePart = trimmed.slice(separatorIndex + 1).trim()
		const [minRaw, maxRaw] = rangePart.split(':')
		const min = Number.parseFloat(minRaw ?? '')
		const max = Number.parseFloat(maxRaw ?? '')

		if (instanceTag && Number.isFinite(min) && Number.isFinite(max) && min < max) {
			ranges.set(instanceTag, { min, max })
		}
	}

	return ranges
}
