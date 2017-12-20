import * as console from "./service/console";
import * as fs from "fs";
import * as mkdirp from "mkdirp";
import * as path from "path";

import { PREFERENCES_DIR_PATH } from "./preferences";
import { VERSION } from "./main";
import axios from "axios";

// Check for updates at most once every hour.
const MIN_UPDATE_CHECK_PERIOD_MILLIS = 60 * 60 * 1000;

const UPDATE_CHECK_PREFERENCES_PATH = path.join(
  PREFERENCES_DIR_PATH,
  "last-update-check.json"
);

export async function checkVersionIfNecessary(): Promise<void> {
  let lastUpdateCheck: LastUpdateCheck;
  if (fs.existsSync(UPDATE_CHECK_PREFERENCES_PATH)) {
    lastUpdateCheck = JSON.parse(
      fs.readFileSync(UPDATE_CHECK_PREFERENCES_PATH, "utf8")
    );
  } else {
    lastUpdateCheck = {
      timestampMillis: 0
    };
  }
  if (
    lastUpdateCheck.timestampMillis <
    Date.now() - MIN_UPDATE_CHECK_PERIOD_MILLIS
  ) {
    // It's been long enough. Check now.
    let info = await axios.get("https://registry.npmjs.org/@zenclabs%2Fdeploy");
    if (info.data["dist-tags"] && info.data["dist-tags"]["latest"]) {
      let latestVersion = info.data["dist-tags"]["latest"];
      lastUpdateCheck = {
        timestampMillis: Date.now(),
        latestVersion: latestVersion
      };
      mkdirp.sync(PREFERENCES_DIR_PATH);
      fs.writeFileSync(
        UPDATE_CHECK_PREFERENCES_PATH,
        JSON.stringify(lastUpdateCheck, null, 2),
        "utf8"
      );
    }
  }
  if (
    lastUpdateCheck.latestVersion &&
    lastUpdateCheck.latestVersion !== VERSION
  ) {
    console.logWarning(
      `Warning: You are using an old version of Deploy. Please upgrade to ${
        lastUpdateCheck.latestVersion
      }.`
    );
  }
}

// This is persisted on disk. Edit with care.
type LastUpdateCheck = {
  timestampMillis: number;
  latestVersion?: string;
};
