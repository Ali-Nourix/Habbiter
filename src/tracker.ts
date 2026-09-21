/* ==========================================================================
   TRACKER VIEW
   The thing you actually see in the note.

   Two rules shape everything here. The tracker is content, not a widget: no
   card, no border, no fill of its own — it sits on the page the way a table
   does. And its controls are chrome: the month you are looking at is always
   legible, but the buttons that change it stay out of the way until a pointer
   or the keyboard asks for them.
   ========================================================================== */

import { Menu, MarkdownRenderChild, Notice, setIcon, setTooltip } from "obsidian";
import {
  addDays,
  civilOf,
  dateOf,
  DAYS_IN_WEEK,
  dayTitle,
  formatNumber,
  intoWeeks,
  isoKey,
  monthLength,
  monthTitle,
  sameDay,
  shiftMonths,
  startOfMonth,
  today,
  weekdayLabels,
} from "./calendar";
import type { Band, BlockConfig, ResolvedConfig } from "./config";
import { MONTH_ROW_KEY } from "./store";
import type { ValueSource } from "./values";

export interface TrackerDeps {
  config: ResolvedConfig;
  /** The block as written, for handing back to the builder unchanged. */
  block: BlockConfig;
  values: ValueSource;
  /** Absent when the block cannot be located in a file — preview, export. */
  writeBlock?: (next: BlockConfig) => Promise<boolean>;
  openBuilder?: () => void;
  /** Adds another tracker to this block, beside this one. */
  addBeside?: () => void;
  /** Drops this tracker from the block. The ticks outlive it, under its id. */
  removeFromGroup?: () => void;
  /** Set when the block has no id, so ticks are going nowhere durable. */
  unanchored?: boolean;
  /** Present only for a tracker standing in a row with others. */
  group?: GroupHandle;
  /** Set when something shares the block with it and it has to make room. */
  compact?: boolean;
}

export interface GroupHandle {
  move: (by: number) => void;
  position: () => { index: number; count: number };
}

interface Column {
  key: string;
  label: string;
  /** Only day columns have one; it drives "today" and the weekday header. */
  date?: Date;
}

interface StatCell {
  el: HTMLElement;
  compute: () => number;
}

export class TrackerView extends MarkdownRenderChild {
  private monthOffset = 0;
  private cells: Array<HTMLButtonElement | null> = [];
  private statCells: StatCell[] = [];
  private headStats: HTMLElement | null = null;
  private columns: Column[] = [];
  private rows: string[] = [];
  private columnsPerRow = 7;
  private focusIndex = 0;

  constructor(
    containerEl: HTMLElement,
    private deps: TrackerDeps,
  ) {
    super(containerEl);
  }

  override onload(): void {
    this.containerEl.addClass("hb-root");
    this.render();
  }

  /** Re-read the same block after something outside this view changed it. */
  refresh(deps?: Partial<TrackerDeps>): void {
    if (deps) this.deps = { ...this.deps, ...deps };
    this.render();
  }

  private get config(): ResolvedConfig {
    return this.deps.config;
  }

  private get values(): ValueSource {
    return this.deps.values;
  }

  /* A tracker sharing its block — with text, or with other trackers — is a
     widget: as wide as the grid it shows and no wider, or there is nothing
     left for whatever is beside it. One with the block to itself can spread
     its header out along it. */
  /* Only day columns get broken up. Columns somebody named themselves are
     however many they said, and there is no seam in them to break at. */
  private get dayLayout(): Band | null {
    return this.config.columns.kind === "days" ? this.config.band : null;
  }

  private get isCompact(): boolean {
    return Boolean(this.deps.group) || Boolean(this.deps.compact);
  }

  private render(): void {
    const el = this.containerEl;
    const hadFocus = el.contains(document.activeElement);

    el.empty();
    el.toggleClass("is-round", this.config.round);
    el.toggleClass("is-controls-visible", this.config.alwaysShowControls);
    el.dataset.mode = this.config.mode;
    el.dataset.cell = this.config.cell;
    el.dataset.side = this.config.side;
    el.toggleClass("is-compact", this.isCompact);
    /* Not --hb-cell directly: a coarse pointer raises the floor on this, and
       a value written into the style attribute would outrank that. */
    el.style.setProperty("--hb-size", `${this.config.size}px`);

    const anchor = this.anchorDate();
    this.columns = this.buildColumns(anchor);
    this.rows = this.config.mode === "month" ? [MONTH_ROW_KEY] : this.config.rows;
    this.cells = [];
    this.statCells = [];

    this.renderHead(el, anchor);
    if (this.config.mode === "month") this.renderCalendar(el, anchor);
    else if (this.dayLayout === "wrap") this.renderStrip(el);
    else if (this.dayLayout === "week") this.renderBands(el);
    else this.renderGrid(el);
    if (this.deps.unanchored && this.deps.openBuilder) this.renderUnanchoredNotice(el);

    this.setRovingFocus(this.focusIndex, hadFocus);
  }

  /* --- Dates ------------------------------------------------------------ */

  /** The first day of the month on show, honouring a pin and the nav arrows. */
  private anchorDate(): Date {
    const { month, calendar } = this.config;
    let base = today();

    const pinned = /^(\d{3,4})-(\d{1,2})$/.exec(month.trim());
    if (pinned) {
      base = dateOf({ year: Number(pinned[1]), month: Number(pinned[2]), day: 1 }, calendar);
    }
    return shiftMonths(base, this.monthOffset, calendar);
  }

  private buildColumns(anchor: Date): Column[] {
    const { calendar, locale, numerals, columns } = this.config;

    if (columns.kind === "labels") {
      return columns.labels.map((label) => ({ key: label, label }));
    }

    const first = startOfMonth(anchor, calendar);
    return Array.from({ length: monthLength(anchor, calendar) }, (_, i) => {
      const date = addDays(first, i);
      return {
        key: isoKey(date),
        label: formatNumber(civilOf(date, calendar).day, locale, numerals),
        date,
      };
    });
  }

  /* --- Header ----------------------------------------------------------- */

  private renderHead(parent: HTMLElement, anchor: Date): void {
    const { config } = this;
    const showsMonth = config.columns.kind === "days";
    const head = parent.createDiv({ cls: "hb-head" });

    if (config.title) {
      head.createDiv({ cls: "hb-title", text: config.title });
      /* A flex line break. In a row the header has to fold the same way for
         every tracker or their grids start at different heights, and where
         it folds cannot be left to how long somebody's title happens to be.
         CSS hides it everywhere else. */
      head.createDiv({ cls: "hb-break" });
    }

    if (showsMonth) {
      head.createDiv({
        /* With no title of its own the month is the tracker's name, so it
           takes the title's weight rather than sitting there as a caption. */
        cls: config.title ? "hb-month" : "hb-month is-lead",
        text: monthTitle(
          anchor,
          config.calendar,
          config.locale,
          config.numerals,
          this.isCompact,
        ),
      });
    }

    if (config.mode === "month" && (config.streak || config.totals)) {
      this.headStats = head.createDiv({ cls: "hb-stats" });
      this.renderHeadStats();
    } else {
      this.headStats = null;
    }

    const tools = head.createDiv({ cls: "hb-tools" });
    if (showsMonth) {
      this.addTool(tools, "chevron-left", "Previous month", () => this.stepMonth(-1), true);
      if (this.monthOffset !== 0) {
        this.addTool(tools, "rotate-ccw", "Back to this month", () => this.stepMonth(0, true));
      }
      this.addTool(tools, "chevron-right", "Next month", () => this.stepMonth(1), true);
    }
    this.addTool(tools, "more-horizontal", "Tracker options", (event) =>
      this.openMenu(event, anchor),
    );
  }

  private renderHeadStats(): void {
    const stats = this.headStats;
    if (!stats) return;

    const { config } = this;
    const row = MONTH_ROW_KEY;
    stats.empty();

    if (config.streak) {
      const days = this.streakOf(row);
      const stat = stats.createSpan({
        cls: "hb-stat",
        text: `${formatNumber(days, config.locale, config.numerals)} day streak`,
      });
      stat.toggleClass("is-live", days > 0);
    }

    if (config.totals) {
      const done = this.columns.filter((column) => this.values.get(row, column.key) > 0).length;
      const of = (value: number) => formatNumber(value, config.locale, config.numerals);
      stats.createSpan({ cls: "hb-stat", text: `${of(done)} / ${of(this.columns.length)}` });
    }
  }

  private addTool(
    parent: HTMLElement,
    icon: string,
    label: string,
    onClick: (event: MouseEvent) => void,
    /* Chevrons point the other way in a right-to-left note. The rest of the
       icons are either symmetric or carry their own meaning, so only the
       ones marked here get mirrored. */
    directional = false,
  ): void {
    const button = parent.createEl("button", {
      cls: directional ? "hb-tool is-nav" : "hb-tool",
      attr: { type: "button", "aria-label": label },
    });
    setIcon(button, icon);
    setTooltip(button, label, { placement: "top" });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      onClick(event);
    });
  }

  /* The grip is a button, not a bare handle: it has to be reachable and
     labelled even though what it is for — dragging — is not. The same move
     is in the menu for everyone who cannot drag. */
  private stepMonth(delta: number, reset = false): void {
    this.monthOffset = reset ? 0 : this.monthOffset + delta;
    this.render();
  }

  /* --- Bodies ----------------------------------------------------------- */

  private renderCalendar(parent: HTMLElement, anchor: Date): void {
    const { config } = this;
    this.columnsPerRow = 7;

    const grid = parent.createDiv({ cls: "hb-body" }).createDiv({ cls: "hb-cal" });
    grid.style.setProperty("--hb-cols", "7");

    if (config.weekdays) {
      /* A column is one cell wide, which is nowhere near "Wednesday" or
         "چهارشنبه". The narrow form is what fits; the readable name is one
         hover away and is what a screen reader is given. */
      const narrow = weekdayLabels(config.locale, config.weekStart, true);
      const full = weekdayLabels(config.locale, config.weekStart);
      narrow.forEach((label, index) => {
        const head = grid.createDiv({ cls: "hb-weekday", text: label });
        head.setAttribute("aria-label", full[index]);
        setTooltip(head, full[index], { placement: "top" });
      });
    }

    const first = this.columns[0]?.date ?? startOfMonth(anchor, config.calendar);
    const lead = (first.getDay() - config.weekStart + 7) % 7;
    for (let i = 0; i < lead; i++) {
      grid.createDiv({ cls: "hb-blank" });
      this.cells.push(null);
    }

    for (const column of this.columns) {
      this.cells.push(this.renderCell(grid, MONTH_ROW_KEY, column, ""));
    }

    /* Trailing blanks so the last week is a full row: without them a month
       ending on a Tuesday leaves the grid's final row visibly short of the
       column rule the weeks above it set up. */
    const trail = (7 - ((lead + this.columns.length) % 7)) % 7;
    for (let i = 0; i < trail; i++) {
      grid.createDiv({ cls: "hb-blank" });
      this.cells.push(null);
    }
  }

  /* A month laid flat is 31 columns, which is wider than any note and ends
     in a scrollbar — and a scrollbar is where a tracker stops being glanced
     at. Broken into weeks it stacks instead, and because every band starts
     on the same weekday the columns line up down the page, which is what
     lets the weekday names be stated once at the top instead of crammed
     into each 26px column beside a date. */
  /* The month as one strip of days that runs on to the next line when it
     reaches the edge — as many as the note is wide, then the rest below.
     Breaking at the weeks instead lines the columns up, but a month in
     seven aligned columns is the calendar, drawn twice.

     Each day carries its own date, in the same box that wraps with it. A
     row of dates above a row of cells would be two things wrapping
     separately, and they would stop lining up at the first line break. */
  private renderStrip(parent: HTMLElement): void {
    const { config } = this;
    const named = this.rows.some((row) => row !== "");
    const stats = this.gridStatColumns();
    const narrow = config.weekdays
      ? weekdayLabels(config.locale, config.weekStart, true)
      : null;
    const wide = config.weekdays ? weekdayLabels(config.locale, config.weekStart) : null;

    const body = parent.createDiv({ cls: "hb-body is-wrapped" });

    for (const row of this.rows) {
      if (named || stats.length) {
        const line = body.createDiv({ cls: "hb-striphead" });
        if (named) line.createDiv({ cls: "hb-rowhead", text: row });
        for (const stat of stats) {
          const box = line.createSpan({ cls: "hb-stat" });
          box.createSpan({ cls: "hb-stat-name", text: stat.label });
          const cell: StatCell = {
            el: box.createSpan({ cls: "hb-stat-value" }),
            compute: () => stat.of(row),
          };
          this.statCells.push(cell);
          this.paintStat(cell);
        }
      }

      const strip = body.createDiv({ cls: "hb-strip" });
      for (const column of this.columns) {
        const day = strip.createDiv({ cls: "hb-day" });
        const cap = day.createDiv({ cls: "hb-daycap" });
        if (narrow && wide && column.date) {
          const index = (column.date.getDay() - config.weekStart + DAYS_IN_WEEK) % DAYS_IN_WEEK;
          const mark = cap.createDiv({ cls: "hb-dayname", text: narrow[index] });
          mark.setAttribute("aria-label", wide[index]);
        }
        const number = cap.createDiv({ cls: "hb-daynum", text: column.label });
        number.toggleClass("is-today", Boolean(column.date && sameDay(column.date, today())));
        this.cells.push(this.renderCell(day, row, column, row));
      }
    }
  }

  private renderBands(parent: HTMLElement): void {
    const { config } = this;
    const named = this.rows.some((row) => row !== "");
    const stats = this.gridStatColumns();
    this.columnsPerRow = DAYS_IN_WEEK;

    /* One grid for the lot, not a grid per row. Sibling grids each size
       their own label column to their own contents, so the weekday names,
       the dates and the cells would each sit a few pixels off the others;
       sharing one template is what keeps the weeks in line down the page.
       Subgrid would say this better and is younger than the Electron some
       vaults are still on. */
    const grid = parent.createDiv({ cls: "hb-body" }).createDiv({ cls: "hb-bands" });
    grid.style.setProperty("--hb-cols", String(DAYS_IN_WEEK));
    grid.toggleClass("has-labels", named);

    const spacer = () => {
      if (named) grid.createDiv({ cls: "hb-rowhead is-spacer" });
    };
    const gap = () => grid.createDiv({ cls: "hb-bandgap" });

    if (config.weekdays) {
      const wide = weekdayLabels(config.locale, config.weekStart);
      const narrow = weekdayLabels(config.locale, config.weekStart, true);
      spacer();
      narrow.forEach((label, index) => {
        const cell = grid.createDiv({ cls: "hb-weekday", text: label });
        cell.setAttribute("aria-label", wide[index]);
        setTooltip(cell, wide[index], { placement: "top" });
      });
    }

    const first = this.columns[0]?.date;
    const weeks = first
      ? intoWeeks(this.columns, first.getDay(), config.weekStart)
      : [this.columns];

    weeks.forEach((week, index) => {
      if (index > 0 || config.weekdays) gap();

      spacer();
      for (const column of week) {
        const cell = grid.createDiv({ cls: "hb-colhead" });
        if (!column) continue;
        cell.toggleClass("is-today", Boolean(column.date && sameDay(column.date, today())));
        cell.setText(column.label);
      }

      for (const row of this.rows) {
        if (named) grid.createDiv({ cls: "hb-rowhead", text: row });
        for (const column of week) {
          if (!column) {
            grid.createDiv({ cls: "hb-blank" });
            this.cells.push(null);
            continue;
          }
          this.cells.push(this.renderCell(grid, row, column, row));
        }
      }
    });

    if (!stats.length) return;

    /* One tally for the month, not one per band: a total that started over
       every week would not be the number anybody asked for. It goes across
       the day columns rather than in columns of its own, so the grid keeps
       the one template every other row is using. */
    gap();
    for (const row of this.rows) {
      if (named) grid.createDiv({ cls: "hb-rowhead", text: row });
      const line = grid.createDiv({ cls: "hb-stats-row" });
      for (const stat of stats) {
        const box = line.createSpan({ cls: "hb-stat" });
        box.createSpan({ cls: "hb-stat-name", text: stat.label });
        const cell: StatCell = {
          el: box.createSpan({ cls: "hb-stat-value" }),
          compute: () => stat.of(row),
        };
        this.statCells.push(cell);
        this.paintStat(cell);
      }
    }
  }

  private renderGrid(parent: HTMLElement): void {
    const { config } = this;
    const stats = this.gridStatColumns();
    this.columnsPerRow = this.columns.length;

    const grid = parent.createDiv({ cls: "hb-body" }).createDiv({ cls: "hb-grid" });
    grid.style.setProperty("--hb-cols", String(this.columns.length));
    grid.style.setProperty("--hb-stats", String(stats.length));

    const named = this.rows.some((row) => row !== "");
    grid.toggleClass("has-labels", named);

    /* Day columns follow the calendar's own "show weekday names" switch;
       columns the author named have no header at all without their names. */
    const showHeads = config.columns.kind === "labels" || config.weekdays;
    if (showHeads) {
      const narrow = weekdayLabels(config.locale, config.weekStart, true);
      if (named) grid.createDiv({ cls: "hb-corner hb-sticky" });
      for (const column of this.columns) {
        const head = grid.createDiv({ cls: "hb-colhead" });
        head.toggleClass("is-today", Boolean(column.date && sameDay(column.date, today())));
        head.setText(this.columnHeadLabel(column, narrow));
      }
      for (const stat of stats) {
        grid.createDiv({ cls: "hb-colhead is-stat", text: stat.label });
      }
    }

    for (const row of this.rows) {
      if (named) grid.createDiv({ cls: "hb-rowhead hb-sticky", text: row });
      for (const column of this.columns) {
        this.cells.push(this.renderCell(grid, row, column, row));
      }
      for (const stat of stats) {
        const el = grid.createDiv({ cls: "hb-statcell" });
        const cell: StatCell = { el, compute: () => stat.of(row) };
        this.statCells.push(cell);
        this.paintStat(cell);
      }
    }
  }

  private gridStatColumns(): Array<{ label: string; of: (row: string) => number }> {
    const stats: Array<{ label: string; of: (row: string) => number }> = [];
    if (this.config.totals) {
      stats.push({
        label: "Total",
        of: (row) => this.columns.reduce((sum, c) => sum + this.values.get(row, c.key), 0),
      });
    }
    /* A streak is a run of days, so it only means anything when the columns
       are days. On a "Week 1 / Week 2" grid the number would be a fiction. */
    if (this.config.streak && this.config.columns.kind === "days") {
      stats.push({ label: "Streak", of: (row) => this.streakOf(row) });
    }
    return stats;
  }

  private columnHeadLabel(column: Column, narrowWeekdays: string[]): string {
    if (!column.date) return column.label;
    const { locale, weekStart, numerals, calendar, dayNumbers } = this.config;
    const weekday = narrowWeekdays[(column.date.getDay() - weekStart + 7) % 7];
    if (!dayNumbers) return weekday;
    const day = formatNumber(civilOf(column.date, calendar).day, locale, numerals);
    /* A thin space, not a full one: the pair has to read as one label and
       still clear the column beside it at the default cell size. */
    return `${weekday}\u2009${day}`;
  }

  private renderUnanchoredNotice(parent: HTMLElement): void {
    const notice = parent.createDiv({ cls: "hb-notice" });
    notice.createSpan({ text: "This tracker has no id, so its ticks are not being kept." });
    notice
      .createEl("button", { cls: "hb-notice-action", text: "Give it one" })
      .addEventListener("click", () => this.deps.openBuilder?.());
  }

  /* --- Cells ------------------------------------------------------------ */

  private renderCell(
    parent: HTMLElement,
    row: string,
    column: Column,
    rowLabel: string,
  ): HTMLButtonElement {
    const cell = parent.createEl("button", { cls: "hb-cell", attr: { type: "button" } });
    cell.tabIndex = -1;

    const isToday = Boolean(column.date && sameDay(column.date, today()));
    cell.toggleClass("is-today", isToday);
    if (isToday) cell.setAttribute("aria-current", "date");

    const mark = cell.createDiv({ cls: "hb-mark" });
    /* Both children exist from the start whatever the value is. Swapping the
       node on every click would replace the element mid-transition, and the
       one moment of motion this plugin has would never be seen. */
    /* The tick is drawn in CSS rather than set as an icon. Obsidian's own
       task checkboxes draw theirs the same way, and an <svg> inside a
       <button> is what every theme's icon-button heuristic is looking for —
       Bookcloth's resizes it to 18px with !important, which is right for a
       toolbar and wrong for a 20px cell. A border has no such argument. */
    if (this.showsNumber()) mark.createSpan({ cls: "hb-num" });
    else mark.createDiv({ cls: "hb-check" });

    this.paintCell(cell, row, column, rowLabel);

    cell.addEventListener("click", (event) => {
      this.cycle(row, column, event.shiftKey);
      this.paintCell(cell, row, column, rowLabel);
      this.repaintStats();
    });
    cell.addEventListener("keydown", (event) =>
      this.onCellKey(event, cell, row, column, rowLabel),
    );
    cell.addEventListener("focus", () => {
      const index = this.cells.indexOf(cell);
      if (index >= 0) this.focusIndex = index;
    });
    return cell;
  }

  /* In a calendar the day number is the cell's content and the fill is what
     says "done" — a tick on top of a number is two marks for one fact. */
  private showsNumber(): boolean {
    const { cell, mode, dayNumbers } = this.config;
    return cell === "count" || (mode === "month" && dayNumbers);
  }

  private paintCell(
    cell: HTMLButtonElement,
    row: string,
    column: Column,
    rowLabel: string,
  ): void {
    const { config } = this;
    const value = this.values.get(row, column.key);

    cell.toggleClass("is-done", value > 0);
    if (config.cell === "count") {
      cell.toggleClass("is-full", value >= config.goal);
      cell.style.setProperty("--hb-fill", String(Math.min(1, value / config.goal)));
    }

    const num = cell.querySelector<HTMLElement>(".hb-num");
    if (num) num.setText(this.cellText(column, value));

    const when = column.date
      ? dayTitle(column.date, config.calendar, config.locale, config.numerals)
      : column.label;
    const subject = rowLabel || config.title;
    const name = subject ? `${subject} — ${when}` : when;

    if (config.cell === "check") {
      cell.setAttribute("aria-pressed", String(value > 0));
      cell.setAttribute("aria-label", name);
    } else {
      cell.setAttribute("aria-label", `${name}: ${value} of ${config.goal}`);
    }
    setTooltip(cell, name, { placement: "top" });
  }

  private cellText(column: Column, value: number): string {
    const { config } = this;
    if (config.cell === "count") {
      return value > 0 ? formatNumber(value, config.locale, config.numerals) : "";
    }
    return column.label;
  }

  /* Click cycles up and wraps at the goal rather than climbing forever, so a
     mistake is always one more click from zero — the same way a checkbox is.
     Typing + can still push a cell past its goal; the side starts from the
     goal in that case, so one click still brings it home. */
  private cycle(row: string, column: Column, backwards: boolean): void {
    const top = this.config.cell === "check" ? 1 : this.config.goal;
    const current = Math.min(this.values.get(row, column.key), top);
    const span = top + 1;
    const next = (((current + (backwards ? -1 : 1)) % span) + span) % span;
    this.values.set(row, column.key, next);
  }

  private repaintStats(): void {
    this.renderHeadStats();
    for (const stat of this.statCells) this.paintStat(stat);
  }

  private paintStat(stat: StatCell): void {
    const { locale, numerals } = this.config;
    stat.el.setText(formatNumber(stat.compute(), locale, numerals));
  }

  /* --- Keyboard ---------------------------------------------------------- */

  private onCellKey(
    event: KeyboardEvent,
    cell: HTMLButtonElement,
    row: string,
    column: Column,
    rowLabel: string,
  ): void {
    const index = this.cells.indexOf(cell);
    if (index < 0) return;

    const rtl = getComputedStyle(this.containerEl).direction === "rtl";
    const forward = rtl ? -1 : 1;
    const perRow = Math.max(1, this.cellsPerLine());

    const steps: Record<string, number> = {
      ArrowRight: forward,
      ArrowLeft: -forward,
      ArrowDown: perRow,
      ArrowUp: -perRow,
    };

    if (event.key in steps) {
      event.preventDefault();
      const step = steps[event.key];
      this.focusNearest(index + step, Math.sign(step));
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const rowStart = index - (index % perRow);
      if (event.key === "Home") this.focusNearest(rowStart, 1);
      else this.focusNearest(Math.min(rowStart + perRow - 1, this.cells.length - 1), -1);
      return;
    }

    const nudge = keyNudge(event.key);
    if (nudge === undefined) return;

    event.preventDefault();
    const current = this.values.get(row, column.key);
    this.values.set(row, column.key, Math.max(0, nudge === null ? 0 : current + nudge));
    this.paintCell(cell, row, column, rowLabel);
    this.repaintStats();
  }

  /* How many cells share a line. Fixed by the template everywhere except a
     wrapping strip, where only the layout knows — so it is asked, at the
     moment an arrow key needs the answer rather than at render. */
  private cellsPerLine(): number {
    if (this.dayLayout !== "wrap") return Math.max(1, this.columnsPerRow);

    const first = this.cells.find((cell): cell is HTMLButtonElement => cell !== null);
    if (!first) return 1;
    const top = first.getBoundingClientRect().top;
    const onLine = this.cells.filter(
      (cell) => cell && Math.abs(cell.getBoundingClientRect().top - top) < 1,
    ).length;
    return Math.max(1, onLine);
  }

  /** Steps over the blanks a month's first and last weeks leave behind. */
  private focusNearest(target: number, scan: number): void {
    let index = target;
    while (index >= 0 && index < this.cells.length && !this.cells[index]) index += scan;
    if (index < 0 || index >= this.cells.length) return;
    this.setRovingFocus(index, true);
  }

  /* Exactly one cell is tabbable, so Tab crosses the grid in one press rather
     than walking a reader through thirty-one buttons to reach the next line. */
  private setRovingFocus(index: number, focus: boolean): void {
    let target = index;
    if (!this.cells[target]) {
      target = this.cells.findIndex((cell) => cell !== null);
      if (target < 0) return;
    }
    for (const [i, cell] of this.cells.entries()) {
      if (cell) cell.tabIndex = i === target ? 0 : -1;
    }
    this.focusIndex = target;
    if (focus) this.cells[target]?.focus();
  }

  /* --- Menu -------------------------------------------------------------- */

  private openMenu(event: MouseEvent, anchor: Date): void {
    const menu = new Menu();
    const { config } = this;

    this.containerEl.addClass("is-menu-open");
    menu.onHide(() => this.containerEl.removeClass("is-menu-open"));

    if (this.deps.openBuilder) {
      menu.addItem((item) =>
        item
          .setTitle("Edit tracker…")
          .setIcon("settings-2")
          .onClick(() => this.deps.openBuilder?.()),
      );
    }

    if (this.deps.addBeside) {
      menu.addItem((item) =>
        item
          .setTitle("Add one beside this…")
          .setIcon("columns-2")
          .onClick(() => this.deps.addBeside?.()),
      );
    }

    if (this.deps.group && this.deps.removeFromGroup) {
      menu.addItem((item) =>
        item
          .setTitle("Take out of the row")
          .setIcon("trash-2")
          .onClick(() => this.deps.removeFromGroup?.()),
      );
    }

    if (config.columns.kind === "days" && this.deps.writeBlock) {
      const pinned = config.month !== "current";
      const civil = civilOf(anchor, config.calendar);
      const pin = `${civil.year}-${String(civil.month).padStart(2, "0")}`;
      menu.addItem((item) =>
        item
          .setTitle(pinned ? "Follow the current month" : "Pin to this month")
          .setIcon(pinned ? "calendar-clock" : "pin")
          .onClick(() => {
            void this.deps.writeBlock?.({
              ...this.deps.block,
              month: pinned ? "current" : pin,
            });
          }),
      );
    }

    if (config.columns.kind === "days" && this.deps.writeBlock) {
      const toPersian = config.calendar !== "persian";
      menu.addItem((item) =>
        item
          .setTitle(toPersian ? "Show in the Persian calendar" : "Show in the Gregorian calendar")
          .setIcon("calendar")
          .onClick(() => {
            void this.deps.writeBlock?.({
              ...this.deps.block,
              calendar: toPersian ? "persian" : "gregorian",
              /* The week starts on a different day in each, and the month
                 names come from a different language. Both are handed back
                 to the calendar unless this tracker asked for its own. */
              weekStart: "auto",
            });
          }),
      );
    }

    /* Swapping sides is the one thing about the text worth a menu item —
       the text itself is a paragraph, and paragraphs are edited in the
       builder where there is room for them. */
    if (this.deps.block.text?.trim() && this.deps.writeBlock) {
      const toEnd = this.config.side !== "end";
      menu.addItem((item) =>
        item
          .setTitle(toEnd ? "Put the text first" : "Put the tracker first")
          .setIcon(toEnd ? "panel-right" : "panel-left")
          .onClick(() => {
            void this.deps.writeBlock?.({
              ...this.deps.block,
              side: toEnd ? "end" : "start",
            });
          }),
      );
    }

    const group = this.deps.group;
    if (group) {
      const { index, count } = group.position();
      menu.addSeparator();
      if (index > 0) {
        menu.addItem((item) =>
          item.setTitle("Move earlier").setIcon("arrow-left").onClick(() => group.move(-1)),
        );
      }
      if (index < count - 1) {
        menu.addItem((item) =>
          item.setTitle("Move later").setIcon("arrow-right").onClick(() => group.move(1)),
        );
      }
      void count;
    }

    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("Clear what is on screen")
        .setIcon("eraser")
        .onClick(() => {
          for (const row of this.rows) {
            for (const column of this.columns) this.values.set(row, column.key, 0);
          }
          this.render();
          new Notice("Cleared the cells on screen.");
        }),
    );

    menu.showAtMouseEvent(event);
  }

  /* --- Statistics -------------------------------------------------------- */

  /* A run of days ending today, or ending yesterday — a habit you have not
     got to yet this evening has not lost its streak, and showing zero from
     midnight would be the plugin nagging rather than reporting. */
  private streakOf(row: string): number {
    const done = new Set(
      this.values.columnsOf(row).filter((key) => this.values.get(row, key) > 0),
    );
    if (done.size === 0) return 0;

    const now = today();
    const cursor = done.has(isoKey(now)) ? now : addDays(now, -1);
    if (!done.has(isoKey(cursor))) return 0;

    let length = 0;
    let day = cursor;
    /* Bounded by the data: the walk cannot outlast the ticks that feed it. */
    while (length < done.size && done.has(isoKey(day))) {
      length++;
      day = addDays(day, -1);
    }
    return length;
  }
}

/** null clears the cell; a number nudges it. undefined means "not my key". */
function keyNudge(key: string): number | null | undefined {
  if (key === "+" || key === "=") return 1;
  if (key === "-") return -1;
  if (key === "Backspace" || key === "Delete") return null;
  return undefined;
}
