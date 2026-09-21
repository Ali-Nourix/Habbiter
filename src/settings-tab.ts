/* ==========================================================================
   SETTINGS TAB
   Kept apart from the settings themselves so that anything needing only the
   defaults — the renderer, the preview harness — does not drag the whole
   settings interface in behind them.
   ========================================================================== */

import { PluginSettingTab, Setting } from "obsidian";
import type { App } from "obsidian";
import { MAX_SIZE, MIN_SIZE } from "./config";
import type HabbiterPlugin from "./main";
import type { HabbiterSettings } from "./settings";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export class HabbiterSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: HabbiterPlugin,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("p", {
      cls: "setting-item-description hb-settings-intro",
      text:
        "These are what a new tracker starts out as, and what any tracker falls " +
        "back to for an option its own block does not mention. Changing one here " +
        "moves every tracker that never had an opinion about it.",
    });

    new Setting(containerEl).setName("Defaults").setHeading();

    new Setting(containerEl).setName("Layout").addDropdown((drop) =>
      drop
        .addOptions({ month: "Month calendar", grid: "Grid" })
        .setValue(this.settings.mode)
        .onChange((value) => this.save({ mode: value as HabbiterSettings["mode"] })),
    );

    new Setting(containerEl).setName("Cells").addDropdown((drop) =>
      drop
        .addOptions({ check: "Checkbox", count: "Counter" })
        .setValue(this.settings.cell)
        .onChange((value) => this.save({ cell: value as HabbiterSettings["cell"] })),
    );

    new Setting(containerEl)
      .setName("Calendar")
      .setDesc("Which months the day columns are cut into.")
      .addDropdown((drop) =>
        drop
          .addOptions({ gregorian: "Gregorian", persian: "Persian (Jalali)" })
          .setValue(this.settings.calendar)
          .onChange((value) =>
            this.save({ calendar: value as HabbiterSettings["calendar"], weekStart: "auto" }),
          ),
      );

    const weekOptions: Record<string, string> = { auto: "Follow the language" };
    WEEKDAYS.forEach((name, index) => (weekOptions[String(index)] = name));

    new Setting(containerEl).setName("Week starts on").addDropdown((drop) =>
      drop
        .addOptions(weekOptions)
        .setValue(String(this.settings.weekStart))
        .onChange((value) => this.save({ weekStart: value === "auto" ? "auto" : Number(value) })),
    );

    new Setting(containerEl)
      .setName("Language")
      .setDesc("Month and weekday names. A tag like fa or en-GB; empty follows the app.")
      .addText((text) =>
        text
          .setPlaceholder("follow the app")
          .setValue(this.settings.locale)
          .onChange((value) => this.save({ locale: value.trim() })),
      );

    new Setting(containerEl)
      .setName("Numerals")
      .setDesc("Persian months can still be counted in 0–9 if that reads better.")
      .addDropdown((drop) =>
        drop
          .addOptions({ locale: "Follow the language", latin: "Always 0–9" })
          .setValue(this.settings.numerals)
          .onChange((value) => this.save({ numerals: value as HabbiterSettings["numerals"] })),
      );

    new Setting(containerEl).setName("Appearance").setHeading();

    new Setting(containerEl)
      .setName("Cell size")
      .setDesc("The side of a cell in pixels.")
      .addSlider((slider) =>
        slider
          .setLimits(MIN_SIZE, MAX_SIZE, 1)
          .setValue(this.settings.size)
          .setDynamicTooltip()
          .onChange((value) => this.save({ size: value })),
      );

    new Setting(containerEl)
      .setName("A month of days")
      .setDesc(
        "A grid with a column per day is 31 wide, which no note is. Running " +
          "on to the next line uses the width there is; breaking at the weeks " +
          "lines the columns up, which is another way of drawing the calendar.",
      )
      .addDropdown((drop) =>
        drop
          .addOptions({
            wrap: "Run on to the next line",
            week: "Break at the weeks",
            none: "One line, scrolled",
          })
          .setValue(this.settings.band)
          .onChange((value) => this.save({ band: value as HabbiterSettings["band"] })),
      );

    new Setting(containerEl)
      .setName("Which side a tracker takes")
      .setDesc("Only applies to a tracker whose block also carries text.")
      .addDropdown((drop) =>
        drop
          .addOptions({ start: "Tracker first, text after", end: "Text first, tracker after" })
          .setValue(this.settings.side === "end" ? "end" : "start")
          .onChange((value) => this.save({ side: value as HabbiterSettings["side"] })),
      );

    new Setting(containerEl)
      .setName("Round cells")
      .setDesc("Circles instead of the corner your theme gives a checkbox.")
      .addToggle((toggle) =>
        toggle.setValue(this.settings.round).onChange((value) => this.save({ round: value })),
      );

    new Setting(containerEl)
      .setName("Always show the controls")
      .setDesc(
        "The month arrows and the options button normally appear on hover so a " +
          "tracker reads as part of the note. Turn this on to keep them out.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.alwaysShowControls)
          .onChange((value) => this.save({ alwaysShowControls: value })),
      );

    new Setting(containerEl).setName("What a tracker shows").setHeading();

    new Setting(containerEl)
      .setName("Day numbers")
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.dayNumbers)
          .onChange((value) => this.save({ dayNumbers: value })),
      );

    new Setting(containerEl)
      .setName("Weekday names")
      .addToggle((toggle) =>
        toggle.setValue(this.settings.weekdays).onChange((value) => this.save({ weekdays: value })),
      );

    new Setting(containerEl)
      .setName("Streak")
      .addToggle((toggle) =>
        toggle.setValue(this.settings.streak).onChange((value) => this.save({ streak: value })),
      );

    new Setting(containerEl)
      .setName("Totals")
      .addToggle((toggle) =>
        toggle.setValue(this.settings.totals).onChange((value) => this.save({ totals: value })),
      );
  }

  private get settings(): HabbiterSettings {
    return this.plugin.store.settings;
  }

  /* Every control writes through here so nothing can change a setting and
     forget to repaint the trackers already on screen. */
  private save(change: Partial<HabbiterSettings>): void {
    Object.assign(this.plugin.store.settings, change);
    void this.plugin.store.saveSettings();
    this.plugin.refreshAll();
    /* A layout or calendar change rewrites which fields below still apply. */
    if ("mode" in change || "calendar" in change) this.display();
  }
}
