import { App, FuzzySuggestModal, Modal, Notice, Setting } from "obsidian";
import { allTemplates, CustomTemplateDef, newCustomId, SummaryTemplate } from "./templates";

/** "Record with template…" picker. */
export class TemplateModal extends FuzzySuggestModal<SummaryTemplate> {
	constructor(app: App, private readonly onPick: (template: SummaryTemplate) => void) {
		super(app);
		this.setPlaceholder("Choose a summary template for this recording…");
	}

	getItems(): SummaryTemplate[] {
		return allTemplates();
	}

	getItemText(t: SummaryTemplate): string {
		return `${t.name} — ${t.useFor}`;
	}

	onChooseItem(t: SummaryTemplate): void {
		this.onPick(t);
	}
}

const PROMPT_PLACEHOLDER = `Goal: a short recap of a sales call for my CRM.

Write:
- painPoints: problems the client mentioned.
- budget: anything said about budget or timing.
- nextSteps: agreed follow-ups, each starting with a verb.`;

/** Create or edit a custom summary template. */
export class TemplateEditModal extends Modal {
	private name: string;
	private useFor: string;
	private prompt: string;

	constructor(
		app: App,
		private readonly existing: CustomTemplateDef | null,
		private readonly takenIds: string[],
		private readonly onSave: (def: CustomTemplateDef) => void | Promise<void>,
	) {
		super(app);
		this.name = existing?.name ?? "";
		this.useFor = existing?.useFor ?? "";
		this.prompt = existing?.prompt ?? "";
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.titleEl.setText(this.existing ? "Edit template" : "New template");

		new Setting(contentEl).setName("Name").addText((t) => t.setPlaceholder("Sales call").setValue(this.name).onChange((v) => (this.name = v)));
		new Setting(contentEl).setName("Use for").setDesc("Optional short description.").addText((t) =>
			t.setPlaceholder("Discovery calls").setValue(this.useFor).onChange((v) => (this.useFor = v)));

		new Setting(contentEl)
			.setName("Instructions")
			.setDesc("Say what to extract and how to write it. The model returns a title, a summary and sections — you don't need to describe the JSON format.");
		const area = contentEl.createEl("textarea", { cls: "nrt-prompt", attr: { rows: "10", placeholder: PROMPT_PLACEHOLDER } });
		area.value = this.prompt;
		area.addEventListener("input", () => (this.prompt = area.value));

		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) => b.setButtonText("Save").setCta().onClick(async () => {
				const name = this.name.trim();
				const prompt = this.prompt.trim();
				if (!name || !prompt) {
					new Notice("A template needs a name and instructions.");
					return;
				}
				const id = this.existing?.id ?? newCustomId(name, [...this.takenIds, ...allTemplates().map((t) => t.id)]);
				await this.onSave({ id, name, useFor: this.useFor.trim(), prompt });
				this.close();
			}));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
