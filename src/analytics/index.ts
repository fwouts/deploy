import * as console from "../service/console";
import * as eventsModule from "./events";
import * as fs from "fs";
import * as inquirer from "inquirer";
import * as mkdirp from "mkdirp";
import * as path from "path";
import * as uuid from "uuid";

import { Event, Tracker } from "./tracker";

import { NoopTracker } from "./noop-tracker";
import { PREFERENCES_DIR_PATH } from "../preferences";
import { RealTracker } from "./real-tracker";

export const events = eventsModule;

const TRACKING_PREFERENCES_PATH = path.join(
  PREFERENCES_DIR_PATH,
  "tracking.json"
);

let tracker: Tracker;

export async function initializeTracker(): Promise<void> {
  tracker = await getTracker();
}

export async function terminate() {
  await tracker.terminate();
}

export function trackEvent(event: Event) {
  tracker.track(event);
}

export async function trackCall<T>(
  callType: eventsModule.TrackedCalls,
  call: () => Promise<T>
): Promise<T> {
  let startTimeMillis = Date.now();
  let errorCode = null;
  let result: T;
  let rethrowError;
  try {
    result = await call();
  } catch (e) {
    rethrowError = e;
    errorCode = e.code || e.reason || "unknown";
  }
  let endTimeMillis = Date.now();
  let event: Event = {
    eventType: "Call: " + callType,
    trackedProperties: {
      durationMillis: endTimeMillis - startTimeMillis,
      errorCode: errorCode
    }
  };
  trackEvent(event);
  if (rethrowError) {
    throw rethrowError;
  } else {
    return result!;
  }
}

async function getTracker(): Promise<Tracker> {
  if (!fs.existsSync(TRACKING_PREFERENCES_PATH)) {
    console.logInfo(
      `Hello there! It looks like you're using Deploy for the first time. We hope it will make your life much easier.`
    );
    let answers = await inquirer.prompt([
      {
        type: "confirm",
        name: "allow-tracking",
        message: `Before we get started, could we collect anonymous statistics? This helps us understand our users better.`
      }
    ]);
    let trackingPreferences: TrackingPreferences;
    if (answers["allow-tracking"]) {
      trackingPreferences = {
        trackingAllowed: true,
        deviceTrackingId: uuid.v4()
      };
    } else {
      trackingPreferences = {
        trackingAllowed: false
      };
    }
    mkdirp.sync(PREFERENCES_DIR_PATH);
    fs.writeFileSync(
      TRACKING_PREFERENCES_PATH,
      JSON.stringify(trackingPreferences, null, 2),
      "utf8"
    );
  }
  let trackingPreferences: TrackingPreferences = JSON.parse(
    fs.readFileSync(TRACKING_PREFERENCES_PATH, "utf8")
  );
  if (trackingPreferences.trackingAllowed) {
    return new RealTracker(trackingPreferences.deviceTrackingId);
  } else {
    return new NoopTracker();
  }
}

// This is persisted on disk. Edit with care.
type TrackingPreferences =
  | {
      trackingAllowed: false;
    }
  | {
      trackingAllowed: true;
      deviceTrackingId: string;
    };
