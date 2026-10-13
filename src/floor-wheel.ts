/** Scroll-snap floor picker; the nearest option to the center is always selected. */
export class FloorWheel {
  private options: HTMLButtonElement[];
  private active?: number;
  private frame = 0;
  private resizeObserver: ResizeObserver;

  constructor(
    private element: HTMLElement,
    private onSelect: (floor: number) => void,
  ) {
    this.options = [...element.querySelectorAll<HTMLButtonElement>('[data-floor]')];
    element.addEventListener('scroll', this.onScroll);
    element.addEventListener('keydown', this.onKey);
    this.resizeObserver = new ResizeObserver(() => {
      if (this.active !== undefined) this.center(this.active);
    });
    this.resizeObserver.observe(element);
  }

  center(floor: number) {
    const option = this.options.find((button) => Number(button.dataset.floor) === floor);
    if (!option) return;
    this.mark(floor);
    this.element.scrollTop =
      option.offsetTop + option.offsetHeight / 2 - this.element.clientHeight / 2;
  }

  private mark(floor: number) {
    this.active = floor;
    for (const option of this.options) {
      const active = Number(option.dataset.floor) === floor;
      option.classList.toggle('active', active);
      option.setAttribute('aria-selected', String(active));
      if (active) this.element.setAttribute('aria-activedescendant', option.id);
    }
  }

  private onScroll = () => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const center = this.element.scrollTop + this.element.clientHeight / 2;
      const option = this.options.reduce<HTMLButtonElement | undefined>((nearest, button) => {
        const distance = (item: HTMLButtonElement) =>
          Math.abs(item.offsetTop + item.offsetHeight / 2 - center);
        return !nearest || distance(button) < distance(nearest) ? button : nearest;
      }, undefined);
      if (!option) return;
      const floor = Number(option.dataset.floor);
      if (floor === this.active) return;
      this.mark(floor);
      this.onSelect(floor);
    });
  };

  private onKey = (event: KeyboardEvent) => {
    const index = this.options.findIndex((button) => Number(button.dataset.floor) === this.active);
    const next =
      event.key === 'ArrowUp'
        ? index - 1
        : event.key === 'ArrowDown'
          ? index + 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? this.options.length - 1
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    const option = this.options[Math.max(0, Math.min(next, this.options.length - 1))];
    if (!option) return;
    const floor = Number(option.dataset.floor);
    this.center(floor);
    this.onSelect(floor);
  };

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.element.removeEventListener('scroll', this.onScroll);
    this.element.removeEventListener('keydown', this.onKey);
  }
}
