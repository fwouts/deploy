import * as awsLoader from "../service/aws/loader";
import * as console from "../service/console";
import * as inquirer from "inquirer";
import * as program from "commander";
import * as regions from "../service/aws/resources/regions";
import * as route53 from "../service/aws/route53";

import { checkedEnvironmentAction } from "./common";

const DOMAIN_REGEX = /^([a-z0-9]+\.)+[a-z]+$/;

program
  .command("unmap [domain]")
  .description("Unmaps an existing DNS record. Example: unmap dev.domain.com")
  .action(
    checkedEnvironmentAction(
      async (domain: string | undefined, options: {}) => {
        if (!domain) {
          let answers = await inquirer.prompt([
            {
              type: "input",
              name: "domain",
              message: `Please enter a domain name, for example www.google.com`,
              validate(input: string): true | string {
                if (typeof input !== "string" || !input.match(DOMAIN_REGEX)) {
                  return `Please enter a valid domain name, for example www.google.com.`;
                }
                return true;
              }
            }
          ]);
          domain = answers["domain"] as string;
        }
        if (!domain.match(DOMAIN_REGEX)) {
          throw new Error(`${domain} is not a valid domain name.`);
        }
        let tldDotPosition = domain.lastIndexOf(".");
        let rootDomainDotPosition = domain.lastIndexOf(".", tldDotPosition - 1);
        let subdomain = domain.substr(0, rootDomainDotPosition);
        let rootDomain = domain.substr(rootDomainDotPosition + 1);
        if (subdomain.length === 0) {
          subdomain = "@";
        }
        await route53.unmap(rootDomain, subdomain);
        console.logSuccess(
          `http://${domain} will soon no longer be available.`
        );
      }
    )
  );
