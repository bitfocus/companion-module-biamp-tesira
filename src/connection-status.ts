export function formatConnectionStatus(commandReady: boolean, pollingReady: boolean): string {
	if (commandReady && pollingReady) return 'Connected'
	if (commandReady) return 'Control connected; polling unavailable'
	if (pollingReady) return 'Polling connected; control unavailable'
	return 'Disconnected'
}
