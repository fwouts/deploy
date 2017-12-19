import * as awsAuth from "../service/aws/auth";
import * as console from "../service/console";
import * as docker from "../service/docker";
import * as inquirer from "inquirer";

const MAX_NAME_LENGTH = 8;

export function checkedEnvironmentAction(f: (...args: any[]) => Promise<any>) {
  async function checked(...args: any[]) {
    await awsAuth.authenticate();
    await docker.checkEnvironment();
    await f(...args);
  }
  return (...args: any[]) => {
    checked(...args).catch(error => {
      console.logError(error);
      process.exit(1);
    });
  };
}

export async function inputName(
  message: string,
  defaultValue: string,
  alreadyUsed: Set<string> = new Set()
): Promise<string> {
  let answers = await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: message,
      validate(input: string): true | string {
        if (typeof input !== "string" || !input.match(/^[a-z][a-z0-9]*$/)) {
          return "Please enter an alphanumeric sequence starting with a character.";
        }
        if (input.length > MAX_NAME_LENGTH) {
          return `Please enter a shorter name (max ${MAX_NAME_LENGTH} characters).`;
        }
        if (alreadyUsed.has(input)) {
          return `The name ${input} is already used.`;
        }
        return true;
      },
      default: defaultValue
    }
  ]);
  return answers["name"];
}

export async function inputInteger(
  message: string,
  defaultValue?: number
): Promise<number> {
  let answers = await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: message,
      validate(input: string): true | string {
        if (input.length > 0 && parseInt(input).toString(10) !== input) {
          return "Please enter an integer.";
        }
        return true;
      },
      default: defaultValue
    }
  ]);
  return answers["name"];
}
