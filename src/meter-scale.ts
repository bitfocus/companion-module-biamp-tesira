export const TESIRA_METER_SCALE = [-64, -54, -45, -38, -27, -18, 0, 6, 12, 18, 24, 30, 36] as const

export function scaleTesiraMeterValue(value: string | number | null | undefined): number {
	const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
	if (!Number.isFinite(numeric) || numeric <= TESIRA_METER_SCALE[0]) return 0

	for (let index = 0; index < TESIRA_METER_SCALE.length - 1; index++) {
		const low = TESIRA_METER_SCALE[index]
		const high = TESIRA_METER_SCALE[index + 1]
		if (numeric <= high) return index + (numeric - low) / (high - low)
	}

	return TESIRA_METER_SCALE.length - 1
}

export function scaleTesiraLevelValue(value: string | number | null | undefined, min: number, max: number): number {
	const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
	if (!Number.isFinite(numeric) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0
	return Math.max(0, Math.min(100, ((numeric - min) / (max - min)) * 100))
}
