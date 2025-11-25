/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as access from "../access.js";
import type * as admin from "../admin.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as care from "../care.js";
import type * as cleanup from "../cleanup.js";
import type * as clerk from "../clerk.js";
import type * as clerkActions from "../clerkActions.js";
import type * as compliance from "../compliance.js";
import type * as complianceEmails from "../complianceEmails.js";
import type * as dataCleanup from "../dataCleanup.js";
import type * as devices from "../devices.js";
import type * as diagnostics from "../diagnostics.js";
import type * as emails from "../emails.js";
import type * as emailsSMTP from "../emailsSMTP.js";
import type * as employees from "../employees.js";
import type * as fireEvac from "../fireEvac.js";
import type * as guardianChecklists from "../guardianChecklists.js";
import type * as http from "../http.js";
import type * as isp from "../isp.js";
import type * as kiosk from "../kiosk.js";
import type * as people from "../people.js";
import type * as router from "../router.js";
import type * as settings from "../settings.js";
import type * as supervisor from "../supervisor.js";
import type * as teams from "../teams.js";
import type * as users from "../users.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  access: typeof access;
  admin: typeof admin;
  audit: typeof audit;
  auth: typeof auth;
  care: typeof care;
  cleanup: typeof cleanup;
  clerk: typeof clerk;
  clerkActions: typeof clerkActions;
  compliance: typeof compliance;
  complianceEmails: typeof complianceEmails;
  dataCleanup: typeof dataCleanup;
  devices: typeof devices;
  diagnostics: typeof diagnostics;
  emails: typeof emails;
  emailsSMTP: typeof emailsSMTP;
  employees: typeof employees;
  fireEvac: typeof fireEvac;
  guardianChecklists: typeof guardianChecklists;
  http: typeof http;
  isp: typeof isp;
  kiosk: typeof kiosk;
  people: typeof people;
  router: typeof router;
  settings: typeof settings;
  supervisor: typeof supervisor;
  teams: typeof teams;
  users: typeof users;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
