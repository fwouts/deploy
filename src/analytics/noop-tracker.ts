import { Event, Tracker } from "./tracker";

export class NoopTracker implements Tracker {
  track(event: Event): void {
    // Do nothing. User does not want to be tracked.
  }
  async terminate() {}
}
