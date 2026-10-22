import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type NoteRecorderPlugin from "./main";
import { listAudioInputs, LOOPBACK_RE, resolveSystemDevice } from "./devices";
import { WHISPER_MODELS } from "./transcriber";
import { listOllamaModels, matchInstalled, modelLabel } from "./summarizer";
import { allTemplates, CustomTemplateDef, findTemplate, getTemplate, setCustomTemplates } from "./templates";
import { TemplateEditModal } from "./template-modal";
import {
	buildHelper, canBuildHelper, helperBuilt, helperPath, NativeAudioError, nativeSupported,
	openScreenRecordingSettings, testNative,
} from "./native-audio";

export interface RecorderSettings {
	recordingsFolder: string; // "" = follow Obsidian's attachment settings
	insertPosition: "cursor" | "end";
	micDeviceId: string; // "default" | deviceId
	systemDeviceId: string; // "native" | "auto" | "none" | deviceId
	micEchoCancellation: boolean;
	micGain: number;
	systemGain: number;
	whisperPath: string; // "" = auto-detect
	whisperModel: string;
	language: string; // "auto" | ISO code
	threads: number; // 0 = auto
	labelSpeakers: boolean;
	micSpeakerName: string;
	systemSpeakerName: string;
	showTimestamps: boolean;
	transcriptFolded: boolean;
	summaryEnabled: boolean;
	summaryTemplate: string; // id of a template in templates.ts
	customTemplates: CustomTemplateDef[];
	ollamaUrl: string;
	ollamaModel: string;
	keepAwake: boolean;
	setupSeen: boolean;
	settingsVersion: number;
}

export const DEFAULT_SETTINGS: RecorderSettings = {
	recordingsFolder: "",
	insertPosition: "cursor",
	micDeviceId: "default",
	systemDeviceId: "native",
	micEchoCancellation: true,
	micGain: 1,
	systemGain: 1,
	whisperPath: "",
	whisperModel: "large-v3-turbo-q5_0",
	language: "auto",
	threads: 0,
	labelSpeakers: true,
	micSpeakerName: "Me",
	systemSpeakerName: "Others",
	showTimestamps: true,
	transcriptFolded: true,
	summaryEnabled: true,
	summaryTemplate: "meeting",
	customTemplates: [],
	ollamaUrl: "http://127.0.0.1:11434",
	ollamaModel: "qwen3:4b",
	keepAwake: true,
	setupSeen: false,
	settingsVersion: 2,
};

const LANGUAGES: Record<string, string> = {
	auto: "Auto-detect",
	en: "English",
	fr: "French",
	de: "German",
	es: "Spanish",
	it: "Italian",
	nl: "Dutch",
	pt: "Portuguese",
	ja: "Japanese",
	zh: "Chinese",
};

const dB = (p: number) => (p > 0 ? `${(20 * Math.log10(p)).toFixed(0)} dB` : "-∞ dB");

/** Captures system audio briefly with the configured source and reports what was heard. */
async function testSystemAudio(plugin: NoteRecorderPlugin): Promise<string> {
	const s = plugin.settings;
	if (s.systemDeviceId === "none") return "System audio is set to Off.";
	let peak: number;
	let source: string;
	if (s.systemDeviceId === "native") {
		if (!nativeSupported()) throw new Error("Built-in capture needs macOS 13 or later — choose BlackHole instead.");
		const dir = plugin.pluginDir;
		if (!helperBuilt(dir)) {
			if (!(await canBuildHelper())) throw new Error("Install Xcode Command Line Tools first (setup assistant).");
			new Notice("Preparing built-in capture (one time, ~30 s)…", 5000);
			await buildHelper(dir);
		}
		peak = await testNative(helperPath(dir));
		source = "Built-in macOS capture";
	} else {
		const dev = await resolveSystemDevice(s.systemDeviceId);
		if (!dev) throw new Error("No loopback device (BlackHole) found.");
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: { deviceId: { exact: dev.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
		});
		const ctx = new AudioContext();
		const an = ctx.createAnalyser();
		an.fftSize = 2048;
		ctx.createMediaStreamSource(stream).connect(an);
		const buf = new Float32Array(an.fftSize);
		peak = 0;
		const end = Date.now() + 4000;
		while (Date.now() < end) {
			an.getFloatTimeDomainData(buf);
			for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
			await new Promise((r) => window.setTimeout(r, 40));
		}
		stream.getTracks().forEach((t) => t.stop());
		await ctx.close();
		source = dev.label;
	}
	if (peak > 0.003) return `✅ ${source}: system audio received (peak ${dB(peak)}).`;
	return s.systemDeviceId === "native"
		? `⚠️ ${source} is running but heard silence. Is something playing? If so, check Privacy & Security → Screen & System Audio Recording → Obsidian, then restart Obsidian.`
		: `⚠️ ${source} heard silence. Set System Settings → Sound → Output to a Multi-Output Device that includes ${source} — or switch to "Built-in macOS capture".`;
}

export class RecorderSettingTab extends PluginSettingTab {
	private ollamaEl: HTMLElement | null = null;

	constructor(app: App, private readonly plugin: NoteRecorderPlugin) {
		super(app, plugin);
	}

	display(): void {
		void this.render();
	}

	private async render(): Promise<void> {
		const { containerEl } = this;
		const s = this.plugin.settings;
		const save = () => this.plugin.saveSettings();
		containerEl.empty();
		containerEl.addClass("nrt-settings");

		new Setting(containerEl)
			.setName("Setup assistant")
			.setDesc("Checks microphone access, system audio, whisper.cpp, speech model and Ollama.")
			.addButton((b) => b.setButtonText("Open setup").setCta().onClick(() => this.plugin.openSetup()));

		new Setting(containerEl).setName("Audio sources").setHeading();

		const devices = await listAudioInputs().catch(() => [] as MediaDeviceInfo[]);
		const real = devices.filter((d) => d.deviceId !== "default" && d.deviceId !== "communications");

		new Setting(containerEl)
			.setName("Microphone")
			.setDesc("Your voice. Avoid choosing a loopback device here.")
			.addDropdown((d) => {
				d.addOption("default", "System default");
				real.filter((x) => !LOOPBACK_RE.test(x.label)).forEach((x) => d.addOption(x.deviceId, x.label || "Microphone"));
				d.setValue(s.micDeviceId).onChange((v) => {
					s.micDeviceId = v;
					void save();
				});
			});

		new Setting(containerEl)
			.setName("System audio (Mac)")
			.setDesc("What your Mac plays (Zoom, Teams, browser…). Built-in capture needs no driver; macOS asks once for Screen & System Audio Recording permission.")
			.addDropdown((d) => {
				d.addOption("native", "Built-in macOS capture (recommended)");
				d.addOption("auto", "BlackHole / Loopback device (auto-detect)");
				d.addOption("none", "Off — microphone only");
				real.forEach((x) => d.addOption(x.deviceId, x.label || "Input"));
				d.setValue(s.systemDeviceId).onChange((v) => {
					s.systemDeviceId = v;
					void save();
				});
			});

		new Setting(containerEl)
			.setName("Test system audio")
			.setDesc("Play something (e.g. a YouTube video), then click Test. Listens for 4 seconds.")
			.addButton((b) => b.setButtonText("Test").onClick(() => {
				void (async () => {
					b.setDisabled(true).setButtonText("Listening…");
					try {
						new Notice(await testSystemAudio(this.plugin), 10000);
					} catch (e) {
						new Notice(`System audio test failed: ${(e as Error).message}`, 12000);
						if (e instanceof NativeAudioError && e.isPermission) openScreenRecordingSettings();
					} finally {
						b.setDisabled(false).setButtonText("Test");
					}
				})();
			}));

		new Setting(containerEl)
			.setName("Microphone echo cancellation")
			.setDesc("Keep on when using speakers. Headphones give the cleanest speaker separation.")
			.addToggle((t) => t.setValue(s.micEchoCancellation).onChange(async (v) => {
				s.micEchoCancellation = v;
				await save();
			}));

		new Setting(containerEl)
			.setName("Microphone level")
			.addSlider((sl) => sl.setLimits(0.2, 3, 0.1).setValue(s.micGain).onChange(async (v) => {
				s.micGain = v;
				await save();
			}));

		new Setting(containerEl)
			.setName("System audio level")
			.addSlider((sl) => sl.setLimits(0.2, 3, 0.1).setValue(s.systemGain).onChange(async (v) => {
				s.systemGain = v;
				await save();
			}));

		new Setting(containerEl).setName("Notes").setHeading();

		new Setting(containerEl)
			.setName("Insert recording at")
			.addDropdown((d) => d
				.addOption("cursor", "Cursor position")
				.addOption("end", "End of note")
				.setValue(s.insertPosition)
				.onChange(async (v) => {
					s.insertPosition = v as "cursor" | "end";
					await save();
				}));

		new Setting(containerEl)
			.setName("Recordings folder")
			.setDesc("Leave empty to follow Obsidian's attachment settings.")
			.addText((t) => t.setPlaceholder("Recordings").setValue(s.recordingsFolder).onChange(async (v) => {
				s.recordingsFolder = v.trim();
				await save();
			}));

		new Setting(containerEl).setName("Transcription").setHeading();

		new Setting(containerEl)
			.setName("Speech model")
			.setDesc("Downloaded once into the plugin folder. Runs offline on your Mac.")
			.addDropdown((d) => {
				WHISPER_MODELS.forEach((m) => d.addOption(m.id, `${m.label} (${m.size})`));
				d.setValue(s.whisperModel).onChange((v) => {
					s.whisperModel = v;
					void save();
				});
			});

		new Setting(containerEl).setName("Language").addDropdown((d) => {
			Object.entries(LANGUAGES).forEach(([k, v]) => d.addOption(k, v));
			d.setValue(s.language).onChange((v) => {
				s.language = v;
				void save();
			});
		});

		new Setting(containerEl)
			.setName("Label speakers")
			.setDesc("Transcribe microphone and system audio separately and label who spoke.")
			.addToggle((t) => t.setValue(s.labelSpeakers).onChange(async (v) => {
				s.labelSpeakers = v;
				await save();
			}));

		new Setting(containerEl)
			.setName("Speaker names")
			.setDesc("Microphone / system audio")
			.addText((t) => t.setPlaceholder("Me").setValue(s.micSpeakerName).onChange(async (v) => {
				s.micSpeakerName = v || "Me";
				await save();
			}))
			.addText((t) => t.setPlaceholder("Others").setValue(s.systemSpeakerName).onChange(async (v) => {
				s.systemSpeakerName = v || "Others";
				await save();
			}));

		new Setting(containerEl).setName("Show timestamps").addToggle((t) => t.setValue(s.showTimestamps).onChange(async (v) => {
			s.showTimestamps = v;
			await save();
		}));

		new Setting(containerEl).setName("Fold transcript callout").addToggle((t) => t.setValue(s.transcriptFolded).onChange(async (v) => {
			s.transcriptFolded = v;
			await save();
		}));

		new Setting(containerEl)
			.setName("whisper.cpp binary")
			.setDesc("Leave empty to auto-detect Homebrew's whisper-cli.")
			.addText((t) => t.setPlaceholder("/opt/homebrew/bin/whisper-cli").setValue(s.whisperPath).onChange(async (v) => {
				s.whisperPath = v.trim();
				await save();
			}));

		new Setting(containerEl)
			.setName("CPU threads")
			.setDesc("0 = automatic")
			.addText((t) => t.setValue(String(s.threads)).onChange(async (v) => {
				s.threads = Math.max(0, parseInt(v) || 0);
				await save();
			}));

		new Setting(containerEl).setName("Summary (Ollama, optional)").setHeading();

		new Setting(containerEl).setName("Generate a summary").addToggle((t) =>
			t.setValue(s.summaryEnabled).onChange(async (v) => {
				s.summaryEnabled = v;
				await save();
			}));

		const templateSetting = new Setting(containerEl).setName("Summary template");
		const describeTemplate = () => {
			const t = getTemplate(s.summaryTemplate);
			templateSetting.setDesc(
				`${t.useFor}. Writes: ${t.writes}.${t.hint ? " " + t.hint : ""} ` +
				"Override per recording with “Record with template…”, or set echostrata-template in the note's properties.",
			);
		};
		templateSetting.addDropdown((d) => {
			const templates = allTemplates();
			templates.forEach((t) => d.addOption(t.id, t.name));
			d.setValue(findTemplate(s.summaryTemplate)?.id ?? templates[0].id).onChange((v) => {
				s.summaryTemplate = v;
				describeTemplate();
				void save();
			});
		});
		describeTemplate();

		const customHeader = new Setting(containerEl)
			.setName("Custom templates")
			.setDesc("Write your own instructions for the summary. They appear next to the built-in templates.")
			.addButton((b) => b.setButtonText("Add template").onClick(() => {
				new TemplateEditModal(this.app, null, s.customTemplates.map((c) => c.id), async (def) => {
					s.customTemplates.push(def);
					await this.saveTemplates();
					this.display();
				}).open();
			}));
		customHeader.settingEl.addClass("nrt-tpl-header");

		for (const def of s.customTemplates) {
			new Setting(containerEl)
				.setName(def.name)
				.setDesc(def.useFor || "Custom template")
				.addButton((b) => b.setButtonText("Edit").onClick(() => {
					new TemplateEditModal(this.app, def, [], async (updated) => {
						Object.assign(def, updated, { id: def.id });
						await this.saveTemplates();
						this.display();
					}).open();
				}))
				.addExtraButton((b) => b.setIcon("trash").setTooltip("Delete").onClick(() => {
					void (async () => {
						s.customTemplates = s.customTemplates.filter((c) => c.id !== def.id);
						if (s.summaryTemplate === def.id) s.summaryTemplate = DEFAULT_SETTINGS.summaryTemplate;
						await this.saveTemplates();
						this.display();
					})();
				}));
		}

		new Setting(containerEl)
			.setName("Ollama URL")
			.setDesc("The model list below refreshes when you leave this field.")
			.addText((t) => {
				t.setValue(s.ollamaUrl).onChange(async (v) => {
					s.ollamaUrl = v.trim() || DEFAULT_SETTINGS.ollamaUrl;
					await save();
				});
				t.inputEl.addEventListener("blur", () => void this.renderOllamaModel());
			});

		this.ollamaEl = containerEl.createDiv();
		void this.renderOllamaModel();

		new Setting(containerEl).setName("Other").setHeading();

		new Setting(containerEl)
			.setName("Keep Mac awake")
			.setDesc("Prevents idle sleep while recording and transcribing.")
			.addToggle((t) => t.setValue(s.keepAwake).onChange(async (v) => {
				s.keepAwake = v;
				await save();
			}));
	}

	private async saveTemplates(): Promise<void> {
		setCustomTemplates(this.plugin.settings.customTemplates);
		await this.plugin.saveSettings();
	}

	/** Dropdown of every model installed in Ollama (falls back to a text field when Ollama is offline). */
	private async renderOllamaModel(): Promise<void> {
		const host = this.ollamaEl;
		if (!host) return;
		const s = this.plugin.settings;
		const save = () => this.plugin.saveSettings();

		host.empty();
		new Setting(host).setName("Ollama model").setDesc("Loading installed models…");

		const models = await listOllamaModels(s.ollamaUrl);
		if (host !== this.ollamaEl) return;
		host.empty();

		const setting = new Setting(host).setName("Ollama model");
		if (models && models.length) {
			const current = matchInstalled(models.map((m) => m.name), s.ollamaModel);
			setting
				.setDesc(`${models.length} model${models.length > 1 ? "s" : ""} installed in Ollama.`)
				.addDropdown((d) => {
					if (!current) d.addOption(s.ollamaModel, `${s.ollamaModel} — not installed`);
					models.forEach((m) => d.addOption(m.name, modelLabel(m)));
					d.setValue(current ?? s.ollamaModel).onChange((v) => {
						s.ollamaModel = v;
						void save().then(() => this.renderOllamaModel());
					});
				});
			if (current && current !== s.ollamaModel) {
				s.ollamaModel = current;
				await save();
			}
		} else {
			setting
				.setDesc(models
					? "Ollama is running but has no models. Download one from the setup assistant, then refresh."
					: "Ollama is not reachable — start Ollama, then refresh. You can still type a model name.")
				.addText((t) => t.setPlaceholder("qwen3:4b").setValue(s.ollamaModel).onChange(async (v) => {
					s.ollamaModel = v.trim() || DEFAULT_SETTINGS.ollamaModel;
					await save();
				}));
		}
		setting.addExtraButton((b) => b.setIcon("refresh-cw").setTooltip("Refresh model list").onClick(() => void this.renderOllamaModel()));
	}
}
