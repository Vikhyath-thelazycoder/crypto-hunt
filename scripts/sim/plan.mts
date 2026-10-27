// The course for a bot run, made by the app's own generator (the same code the admin's Generator page runs).
//   echo '{"teamIds":[…],"locationIds":[…],"areas":{…},"pins":{…},"seed":1}' | npx tsx scripts/sim/plan.mts
import { readFileSync } from "node:fs";
import { generatePlan, type GenerateInput } from "../../src/lib/generator";

const input = JSON.parse(readFileSync(0, "utf8")) as GenerateInput;
process.stdout.write(JSON.stringify(generatePlan(input)));
