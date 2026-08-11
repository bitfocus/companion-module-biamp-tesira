export type LoginPrompt = 'username' | 'password'

export function detectLoginPrompt(buffer: string): LoginPrompt | undefined {
	const prompt = buffer.replace(/\r\0/g, '\n').replace(/\r/g, '\n').split('\n').pop()?.trim().toLowerCase()

	if (!prompt) return undefined
	if (/(?:^|\s)(?:login|username|user name|user):\s*$/.test(prompt)) return 'username'
	if (/(?:^|\s)password:\s*$/.test(prompt)) return 'password'
	return undefined
}
