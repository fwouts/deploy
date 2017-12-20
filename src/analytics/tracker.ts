export interface Tracker {
  track(event: Event): void;
  terminate(): Promise<void>;
}

export interface Event {
  /**
   * Event type name. Must not change unnecessarily across versions. As such, the event type
   * should not be tied to an exact command name (which may change). Instead, it may be tied
   * to the command's role.
   *
   * Example: "Command: Create Cluster".
   */
  eventType: string;

  /**
   * Properties to track in the event.
   *
   * No sensitive or private information should ever be tracked.
   */
  trackedProperties: { [key: string]: any };
}
