import Analytics = require("analytics-node");

import { Event, Tracker } from "./tracker";

import { VERSION } from "../main";

export class RealTracker implements Tracker {
  private client: Analytics;
  private userId: string;
  private context: { [key: string]: string };

  constructor(userId: string) {
    this.userId = userId;
    this.client = new Analytics("aa6w3egVoTcQxSCPaMKMJtpaN3dtF6mb");
    this.context = {
      version: VERSION
    };
  }

  track(event: Event): void {
    this.client.track({
      userId: this.userId,
      event: event.eventType,
      properties: event.trackedProperties,
      context: this.context
    });
  }

  async terminate(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.client.flush(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
