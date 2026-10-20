/** Virtual loopback drivers commonly used to capture macOS system audio. */
export const LOOPBACK_RE = /blackhole|loopback|soundflower|ishowu|background music|zoomaudiodevice|ms teams audio/i;

export async function listAudioInputs(): Promise<MediaDeviceInfo[]> {
	const read = async () =>
		(await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
	let devices = await read();
	// Labels stay empty until microphone permission has been granted once.
	if (devices.length && devices.every((d) => !d.label)) {
		try {
			const s = await navigator.mediaDevices.getUserMedia({ audio: true });
			s.getTracks().forEach((t) => t.stop());
			devices = await read();
		} catch {
			/* permission denied — return unlabeled list */
		}
	}
	return devices;
}

const isAlias = (d: MediaDeviceInfo) => d.deviceId === "default" || d.deviceId === "communications";

/** Resolves the "system audio" setting ("auto" | deviceId) to a concrete input device. */
export async function resolveSystemDevice(setting: string): Promise<MediaDeviceInfo | null> {
	if (setting === "none" || setting === "native") return null;
	const devices = (await listAudioInputs()).filter((d) => !isAlias(d));
	if (setting !== "auto") return devices.find((d) => d.deviceId === setting) ?? null;
	return devices.find((d) => LOOPBACK_RE.test(d.label)) ?? null;
}

/** Warn when the default input is a loopback driver (the "mic" would then be system audio). */
export async function defaultInputIsLoopback(): Promise<boolean> {
	const def = (await listAudioInputs()).find((d) => d.deviceId === "default");
	return !!def && LOOPBACK_RE.test(def.label);
}
